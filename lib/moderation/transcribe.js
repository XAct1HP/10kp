// Whisper transcription for audio-only submissions.
// Uses @xenova/transformers (ONNX Whisper) so it runs in Node without external services.
// The model is downloaded on first use and cached (~150MB for whisper-base).
//
// This module must only be imported from Node runtime routes
// (export const runtime = "nodejs" in the caller). Edge runtime cannot load ONNX.
//
// Audio decoding in Node without ffmpeg is limited. We currently support:
//   - WAV via `wavefile` (bundled dep)
//   - Any format transformers.js's read_audio handles on the host
// For formats we can't decode we throw TranscriptionUnsupportedError so the
// pipeline can route the pitch to manual review with a clear reason.

export class TranscriptionUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "TranscriptionUnsupportedError";
  }
}

let pipelinePromise = null;

async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        env.cacheDir = "/tmp/transformers-cache";
      }
      env.allowRemoteModels = true;
      env.allowLocalModels = false;
      const modelId = process.env.WHISPER_MODEL || "Xenova/whisper-base";
      return pipeline("automatic-speech-recognition", modelId);
    })();
  }
  return pipelinePromise;
}

// Decode a WAV file's raw bytes into a Float32 mono waveform at 16kHz.
async function decodeWav(buffer) {
  const { WaveFile } = await import("wavefile");
  const wav = new WaveFile();
  wav.fromBuffer(new Uint8Array(buffer));
  // Force 32-bit float mono @ 16kHz — Whisper's expected format.
  wav.toBitDepth("32f");
  wav.toSampleRate(16000);
  let samples = wav.getSamples();
  if (Array.isArray(samples)) {
    // Multi-channel — average to mono.
    const channels = samples.length;
    const len = samples[0].length;
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += samples[c][i];
      mono[i] = s / channels;
    }
    return mono;
  }
  return samples instanceof Float32Array ? samples : new Float32Array(samples);
}

// Best-effort decode: WAV bytes work reliably; everything else we try
// transformers.js's built-in read_audio which uses whatever audio backend
// is available. If neither works we throw TranscriptionUnsupportedError.
async function decodeAudio(buffer, mimeType) {
  const isWav =
    (mimeType || "").toLowerCase().includes("wav") ||
    looksLikeRiffWav(buffer);
  if (isWav) {
    return decodeWav(buffer);
  }

  // Try transformers.js's read_audio via a temp file. This may or may not
  // succeed depending on host audio libraries.
  try {
    const os = await import("node:os");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wh-"));
    const tmpFile = path.join(tmpDir, "input.audio");
    await fs.writeFile(tmpFile, Buffer.from(buffer));
    try {
      const { read_audio } = await import("@xenova/transformers");
      return await read_audio(tmpFile, 16000);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (err) {
    throw new TranscriptionUnsupportedError(
      `Could not decode audio (${mimeType || "unknown"}): ${err.message}. Convert to WAV or run transcription via an external service.`
    );
  }
}

function looksLikeRiffWav(buffer) {
  const view = Buffer.from(buffer.slice(0, 12));
  return (
    view.length >= 12 &&
    view.toString("ascii", 0, 4) === "RIFF" &&
    view.toString("ascii", 8, 12) === "WAVE"
  );
}

// Transcribe a buffer of audio bytes. Returns { text }.
export async function transcribeAudioBuffer(buffer, { mimeType } = {}) {
  const asr = await getPipeline();
  const audio = await decodeAudio(buffer, mimeType);
  const output = await asr(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const text = Array.isArray(output)
    ? output.map((o) => o.text).join(" ")
    : output?.text || "";
  return { text: text.trim() };
}

// Fetch an audio URL and transcribe it.
export async function transcribeAudioUrl(url, { mimeType } = {}) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch audio (${res.status}) from ${url}`);
  }
  const buf = await res.arrayBuffer();
  const inferredMime = res.headers.get("content-type") || mimeType;
  return transcribeAudioBuffer(buf, { mimeType: inferredMime });
}
