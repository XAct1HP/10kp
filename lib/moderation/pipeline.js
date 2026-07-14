// Moderation pipeline.
// Given a pitch (text / audio / video / doc), decide approve | flag | reject
// and write the outcome back to the pitches row.
//
// - Text (typed pitch OR extracted from PDF/DOCX/TXT)  → UM-GPT text moderation
// - Audio                                              → Whisper transcript → UM-GPT text moderation
// - Video                                              → Mux transcript + sampled frames → UM-GPT text + vision
//
// This module must be imported from Node-runtime routes only. Callers should
// fire-and-forget so the user doesn't wait: `moderatePitchAsync(pitchId)`.

import { getSupabaseAdmin } from "../supabase";
import { getMuxClient } from "../mux";
import { callJson, imageMessage } from "./umgpt";
import {
  textModerationMessages,
  videoFramesSystemPrompt,
  combineDecisions,
  normalizeResult,
} from "./prompts";
import { transcribeAudioBuffer, TranscriptionUnsupportedError } from "./transcribe";

const FRAME_SAMPLE_INTERVAL_SEC = Number(
  process.env.MODERATION_FRAME_INTERVAL_SEC || 5
);
const MAX_FRAMES_PER_BATCH = 12; // vision request payload cap
const FLAGGED_PRIORITY = 100;

// ---------- Public entry points ----------

// Fire-and-forget: kicks off moderation without awaiting completion.
// Used by API routes so the user response returns immediately.
export function moderatePitchAsync(pitchId) {
  moderatePitch(pitchId).catch((err) => {
    console.error("[moderation] pipeline failed", {
      pitchId,
      error: err?.message,
    });
  });
}

// Main entry — awaitable version, mostly for the webhook and tests.
export async function moderatePitch(pitchId) {
  const supabase = getSupabaseAdmin();

  const { data: pitch, error } = await supabase
    .from("pitches")
    .select(
      "id, title, description, text_content, file_type, file_path, file_name, mux_asset_id, mux_playback_id"
    )
    .eq("id", pitchId)
    .single();

  if (error || !pitch) {
    throw new Error(`Pitch ${pitchId} not found: ${error?.message || "missing"}`);
  }

  try {
    const result = await runPipeline(pitch, supabase);
    await writeResult(supabase, pitchId, result);
    return result;
  } catch (err) {
    console.error("[moderation] pipeline error", {
      pitchId,
      error: err.message,
    });
    await supabase
      .from("pitches")
      .update({
        moderation_status: "flagged",
        moderation_reason: `Moderation pipeline error — flagged for manual review: ${err.message}`,
        moderation_priority: FLAGGED_PRIORITY,
        moderation_checked_at: new Date().toISOString(),
      })
      .eq("id", pitchId);
    throw err;
  }
}

// ---------- Core logic ----------

async function runPipeline(pitch, supabase) {
  const meta = [pitch.title, pitch.description].filter(Boolean).join("\n\n");
  const fileType = classifyFile(pitch);

  if (fileType === "video") {
    return moderateVideo(pitch, meta, supabase);
  }
  if (fileType === "audio") {
    return moderateAudio(pitch, meta, supabase);
  }
  if (fileType === "text-doc") {
    return moderateTextDoc(pitch, meta, supabase);
  }
  // text-only or unknown → moderate the typed content + metadata
  return moderateTextOnly(pitch, meta);
}

function classifyFile(pitch) {
  if (pitch.file_type === "video" || pitch.mux_asset_id) return "video";
  const name = (pitch.file_name || "").toLowerCase();
  if (/\.(mp3|wav|ogg|m4a|aac|weba)$/.test(name)) return "audio";
  if (/\.(pdf|docx|doc|txt)$/.test(name)) return "text-doc";
  if (pitch.text_content) return "text-only";
  return "text-only";
}

// ---- Text-only ----
async function moderateTextOnly(pitch, meta) {
  const combined = [meta, pitch.text_content].filter(Boolean).join("\n\n");
  const result = await moderateText(combined, "text");
  return {
    ...result,
    transcript: null,
  };
}

// ---- PDF / DOCX / TXT ----
async function moderateTextDoc(pitch, meta, supabase) {
  const extracted = await extractDocText(pitch, supabase);
  const combined = [meta, extracted].filter(Boolean).join("\n\n");
  const result = await moderateText(combined, "text");
  return { ...result, transcript: extracted || null };
}

async function extractDocText(pitch, supabase) {
  if (!pitch.file_path) return "";
  const bucket = "pitch-files";
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(pitch.file_path);
  if (error || !data) return "";

  const buffer = Buffer.from(await data.arrayBuffer());
  const name = (pitch.file_name || "").toLowerCase();

  try {
    if (name.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      return Array.isArray(text) ? text.join("\n") : text || "";
    }
    if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return value || "";
    }
    if (name.endsWith(".txt")) {
      return buffer.toString("utf8");
    }
  } catch (err) {
    console.warn("[moderation] doc extract failed", { name, error: err.message });
  }
  return "";
}

// ---- Audio ----
async function moderateAudio(pitch, meta, supabase) {
  let transcript = "";
  if (pitch.file_path) {
    const { data: signed } = await supabase.storage
      .from("pitch-files")
      .createSignedUrl(pitch.file_path, 60 * 10);
    if (signed?.signedUrl) {
      const res = await fetch(signed.signedUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch audio: ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const mimeType = res.headers.get("content-type") || "";
      try {
        const out = await transcribeAudioBuffer(buf, { mimeType });
        transcript = out.text;
      } catch (err) {
        if (err instanceof TranscriptionUnsupportedError) {
          // Route to human review — we couldn't decode/transcribe.
          return {
            decision: "flag",
            confidence: 0.5,
            flags: [
              {
                source: "audio",
                category: "other",
                severity: "low",
                reason: err.message,
              },
            ],
            transcript: null,
          };
        }
        throw err;
      }
    }
  }

  const combined = [meta, transcript].filter(Boolean).join("\n\n");
  const result = await moderateText(combined, "transcript");
  return { ...result, transcript: transcript || null };
}

// ---- Video ----
async function moderateVideo(pitch, meta, supabase) {
  const transcript = await fetchMuxTranscript(pitch).catch((err) => {
    console.warn("[moderation] transcript fetch failed", { error: err.message });
    return "";
  });

  const combinedText = [meta, transcript].filter(Boolean).join("\n\n");
  const textResult = combinedText.trim()
    ? await moderateText(combinedText, "transcript")
    : null;

  const framesResult = pitch.mux_playback_id
    ? await moderateVideoFrames(pitch, supabase).catch((err) => {
        console.warn("[moderation] frame moderation failed", {
          error: err.message,
        });
        return null;
      })
    : null;

  const combined = combineDecisions(textResult, framesResult);
  return { ...combined, transcript: transcript || null };
}

async function fetchMuxTranscript(pitch) {
  if (!pitch.mux_asset_id) return "";
  const mux = getMuxClient();
  // Look up any generated_subtitle tracks and pull their VTT.
  const asset = await mux.video.assets.retrieve(pitch.mux_asset_id);
  const tracks = Array.isArray(asset?.tracks) ? asset.tracks : [];
  const subtitle = tracks.find(
    (t) =>
      t.type === "text" &&
      (t.text_source === "generated_vod" || t.text_type === "subtitles")
  );
  if (!subtitle || !pitch.mux_playback_id) return "";
  const url = `https://stream.mux.com/${pitch.mux_playback_id}/text/${subtitle.id}.vtt`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const vtt = await res.text();
  return vttToPlainText(vtt);
}

function vttToPlainText(vtt) {
  return vtt
    .split(/\r?\n/)
    .filter((line) => line && !/^WEBVTT/i.test(line) && !/-->/.test(line) && !/^\d+$/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function moderateVideoFrames(pitch, supabase) {
  const durationSec = await getMuxDuration(pitch);
  const timestamps = buildSampleTimestamps(durationSec);
  if (timestamps.length === 0) return null;

  const frames = timestamps.map((t) => ({
    timestamp_sec: t,
    url: `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=${t}&width=640`,
  }));

  // Chunk to keep the vision payload manageable.
  const chunks = [];
  for (let i = 0; i < frames.length; i += MAX_FRAMES_PER_BATCH) {
    chunks.push(frames.slice(i, i + MAX_FRAMES_PER_BATCH));
  }

  const chunkResults = [];
  for (const chunk of chunks) {
    const text = `The following ${chunk.length} frames were sampled from the pitch video. Their timestamps in seconds are: ${chunk
      .map((f) => f.timestamp_sec)
      .join(", ")}. Frames appear below in that same order.`;
    const raw = await callJson({
      messages: [
        { role: "system", content: videoFramesSystemPrompt() },
        imageMessage({ text, images: chunk.map((f) => f.url) }),
      ],
    }).catch((err) => {
      console.warn("[moderation] vision batch failed", { error: err.message });
      return null;
    });
    if (!raw) continue;
    const normalized = normalizeResult(raw, { source: "video" });
    // Attach frame URLs to any flag that carries a timestamp.
    for (const f of normalized.flags) {
      const match = chunk.find((c) => c.timestamp_sec === f.timestamp_sec);
      if (match) f.frame_url = match.url;
    }
    chunkResults.push(normalized);
  }

  return combineDecisions(...chunkResults);
}

async function getMuxDuration(pitch) {
  try {
    const mux = getMuxClient();
    const asset = await mux.video.assets.retrieve(pitch.mux_asset_id);
    return Number(asset?.duration) || 0;
  } catch {
    return 0;
  }
}

function buildSampleTimestamps(durationSec) {
  if (!durationSec || durationSec <= 0) return [];
  const step = FRAME_SAMPLE_INTERVAL_SEC;
  const timestamps = [];
  for (let t = 0; t < durationSec; t += step) {
    timestamps.push(Math.min(t, Math.max(0, durationSec - 0.1)));
  }
  // De-duplicate identical trailing timestamps.
  return [...new Set(timestamps.map((t) => Number(t.toFixed(2))))];
}

// ---- Shared text moderation call ----
async function moderateText(text, kind) {
  const cleaned = (text || "").trim();
  if (!cleaned) {
    return { decision: "approve", confidence: 1, flags: [] };
  }
  const raw = await callJson({
    messages: textModerationMessages({ text: cleaned, kind }),
  });
  return normalizeResult(raw, { source: kind === "transcript" ? "audio" : "text" });
}

// ---- Persistence ----
async function writeResult(supabase, pitchId, result) {
  const { decision, confidence, flags, transcript } = result;
  const now = new Date().toISOString();
  const update = {
    moderation_status: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "flagged",
    moderation_flags: flags || [],
    moderation_transcript: transcript || null,
    moderation_priority: decision === "flag" ? FLAGGED_PRIORITY : 0,
    moderation_checked_at: now,
    moderation_reason: buildReason(decision, confidence, flags),
  };
  const { error } = await supabase
    .from("pitches")
    .update(update)
    .eq("id", pitchId);
  if (error) {
    throw new Error(`Failed to persist moderation result: ${error.message}`);
  }
}

function buildReason(decision, confidence, flags) {
  const conf = typeof confidence === "number" ? ` (confidence ${confidence.toFixed(2)})` : "";
  if (!flags || flags.length === 0) {
    return decision === "approve" ? `Auto-approved${conf}` : `${decision}${conf}`;
  }
  const categories = [...new Set(flags.map((f) => f.category))].join(", ");
  return `${decision}${conf} — ${categories}`;
}
