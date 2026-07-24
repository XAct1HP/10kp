// Transcript retrieval for Mux assets.
//
// Video AND audio submissions both live in Mux — audio-only Mux assets
// expose the same auto-generated captions API as video. The pipeline calls
// fetchMuxTranscript() once the asset is ready; if the captions track is
// still generating we return {status:"processing"} so the caller can
// re-queue.

import { getMuxClient } from "../mux.js";

/**
 * Attempt to read the auto-generated English captions track for an asset.
 * @param {string} assetId
 * @param {string|null} playbackId
 * @returns {Promise<{status:"ready"|"processing"|"not_applicable"|"failed",
 *                   text?:string, language?:string, error?:string}>}
 */
export async function fetchMuxTranscript(assetId, playbackId) {
  if (!assetId) return { status: "not_applicable" };

  const mux = getMuxClient();
  let asset;
  try {
    asset = await mux.video.assets.retrieve(assetId);
  } catch (err) {
    return { status: "failed", error: `Failed to retrieve Mux asset: ${err.message}` };
  }
  const tracks = Array.isArray(asset?.tracks) ? asset.tracks : [];
  const subtitle = tracks.find(
    (t) => t.type === "text" &&
      (t.text_source === "generated_vod" || t.text_type === "subtitles")
  );
  if (!subtitle) {
    // Captions haven't shown up yet. Mux populates them shortly after
    // asset.ready — the reconciler will re-check on the next tick.
    return { status: "processing" };
  }
  if (subtitle.status && subtitle.status !== "ready") {
    return { status: "processing" };
  }
  const effectivePlaybackId = playbackId || asset?.playback_ids?.[0]?.id;
  if (!effectivePlaybackId) {
    return { status: "failed", error: "No playback ID available to fetch VTT" };
  }
  const url = `https://stream.mux.com/${effectivePlaybackId}/text/${subtitle.id}.vtt`;
  let vtt;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { status: "failed", error: `VTT fetch ${res.status}` };
    }
    vtt = await res.text();
  } catch (err) {
    return { status: "failed", error: `VTT fetch error: ${err.message}` };
  }
  const text = vttToPlainText(vtt);
  if (!text) {
    // Empty transcript is legitimate for videos with no speech — the
    // pipeline treats this as not_applicable so the visual channel alone
    // decides the outcome.
    return { status: "not_applicable" };
  }
  return {
    status: "ready",
    text,
    language: subtitle.language_code || "en",
  };
}

/**
 * Convert WebVTT into a clean plain-text transcript.
 * Strips WEBVTT header, cue numbers, and timestamp arrows; collapses
 * whitespace.
 * @param {string} vtt
 * @returns {string}
 */
export function vttToPlainText(vtt) {
  if (!vtt) return "";
  return vtt
    .split(/\r?\n/)
    .filter((line) => {
      if (!line) return false;
      if (/^WEBVTT/i.test(line)) return false;
      if (/-->/.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^NOTE\b/.test(line)) return false;
      return true;
    })
    .join(" ")
    .replace(/<[^>]+>/g, "")           // strip <c.speaker> style tags
    .replace(/\s+/g, " ")
    .trim();
}
