import { test } from "node:test";
import assert from "node:assert/strict";

process.env.UMGPT_API_KEY = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.MUX_TOKEN_ID = "test";
process.env.MUX_TOKEN_SECRET = "test";
process.env.MUX_WEBHOOK_SECRET = "test";

const { classifyFile } = await import("../lib/moderation/pipeline.js");

test("classifyFile treats file_type audio as mux-backed audio", () => {
  assert.equal(classifyFile({ file_type: "audio", file_name: "pitch.mp3" }), "audio-mux");
});

test("classifyFile keeps storage audio fallback for legacy rows", () => {
  assert.equal(classifyFile({ file_type: "file", file_name: "legacy.wav" }), "audio-storage");
});
