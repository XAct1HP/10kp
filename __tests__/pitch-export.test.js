import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildPitchCsv,
  buildPitchFileLink,
  buildSubmissionLink,
  formatModerationResult,
  formatTeammates,
  formatUniqnameEmail,
  PITCH_CSV_HEADERS,
} = await import("../lib/pitchExport.js");

const ORIGIN = "https://10kp.example.edu";

const filePitch = {
  id: "pitch-1",
  name: 'Ada "Al" Lovelace',
  uniqname: "adalove",
  submitter_email: "AdaLove@umich.edu",
  teammate_uniqnames: ["bcharles", "gmenabrea"],
  role: "Current student",
  student_level: "Undergraduate",
  schools: ["College of Engineering", "Ross School of Business"],
  title: "Analytical Engine",
  description: "A general\npurpose computing machine.",
  tags: [{ name: "Hardware" }, { name: "AI" }],
  file_type: "file",
  file_name: "deck.pdf",
  file_path: "user/pitch-1/deck.pdf",
  thumbnail_path: "https://cdn/thumb.png",
  vote_count: 12,
  moderation_status: "approved",
  moderation_reason: null,
  mux_status: null,
  created_at: "2026-08-19T14:00:00.000Z",
};

const textPitch = {
  id: "pitch-2",
  name: "Grace Hopper",
  uniqname: "ghopper",
  teammate_uniqnames: [],
  role: "Faculty",
  schools: [],
  title: "Compiler",
  description: "Write code in English.",
  file_type: "file",
  text_content: "The full text of the pitch.",
  vote_count: 0,
  moderation_status: "flagged",
  moderation_reason: "Manual review",
  created_at: "2026-08-20T10:30:00.000Z",
};

const muxPitch = {
  id: "pitch-3",
  name: "Alan Turing",
  uniqname: "aturing",
  teammate_uniqnames: ["jvon"],
  role: "Alumni",
  schools: [],
  title: "Universal Machine",
  description: "One machine, every program.",
  file_type: "video",
  file_name: "pitch.mp4",
  mux_playback_id: "abc123",
  mux_status: "ready",
  vote_count: 3,
  moderation_status: "pending",
  created_at: "2026-08-21T09:00:00.000Z",
};

test("formatUniqnameEmail appends the U-M domain and normalizes case", () => {
  assert.equal(formatUniqnameEmail("AdaLove"), "adalove@umich.edu");
  assert.equal(formatUniqnameEmail("  ghopper  "), "ghopper@umich.edu");
  assert.equal(formatUniqnameEmail(""), "");
  assert.equal(formatUniqnameEmail(null), "");
});

test("formatTeammates joins with semicolons and drops blanks", () => {
  assert.equal(formatTeammates(["bcharles", "", "  GMenabrea "]), "bcharles; gmenabrea");
  assert.equal(formatTeammates([]), "");
  assert.equal(formatTeammates(undefined), "");
});

test("formatModerationResult reduces status to flagged / not flagged", () => {
  assert.equal(formatModerationResult({ moderation_status: "flagged" }), "Flagged");
  assert.equal(formatModerationResult({ moderation_status: "approved" }), "Not flagged");
  assert.equal(formatModerationResult({ moderation_status: "pending" }), "Not flagged");
  assert.equal(formatModerationResult({}), "Not flagged");
});

test("submission links are absolute gallery deep links", () => {
  assert.equal(buildSubmissionLink(filePitch, ORIGIN), `${ORIGIN}/gallery?pitch=pitch-1`);
});

test("pitch file links resolve for uploads and Mux media, blank for text-only", () => {
  assert.equal(buildPitchFileLink(filePitch, ORIGIN), `${ORIGIN}/admin/file/pitch-1`);
  assert.equal(buildPitchFileLink(muxPitch, ORIGIN), `${ORIGIN}/admin/file/pitch-3`);
  assert.equal(buildPitchFileLink(textPitch, ORIGIN), "");
});

test("csv header row matches the exported column contract", () => {
  const [header] = buildPitchCsv([filePitch], ORIGIN).split("\n");
  assert.equal(header, PITCH_CSV_HEADERS.join(","));
  for (const column of [
    "Uniqname",
    "Teammate Uniqnames",
    "Pitch Title",
    "Pitch Description",
    "Link to Submission",
    "Link to Pitch File",
    "Moderation Result",
  ]) {
    assert.ok(PITCH_CSV_HEADERS.includes(column), `missing column: ${column}`);
  }
});

test("csv escapes quotes and flattens newlines so rows stay intact", () => {
  const lines = buildPitchCsv([filePitch], ORIGIN).split("\n");
  assert.equal(lines.length, 2, "a multi-line description must not split the row");
  assert.ok(lines[1].includes('"Ada ""Al"" Lovelace"'));
  assert.ok(lines[1].includes("A general purpose computing machine."));
});

test("csv carries every pitch with one row each", () => {
  const lines = buildPitchCsv([filePitch, textPitch, muxPitch], ORIGIN).split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[2].includes("Flagged"));
  assert.ok(lines[2].includes("The full text of the pitch."));
  assert.ok(lines[3].includes("jvon"));
});

test("csv tolerates a sparse pitch row", () => {
  const csv = buildPitchCsv([{ id: "x" }], ORIGIN);
  const [, row] = csv.split("\n");
  assert.equal(row.split('","').length, PITCH_CSV_HEADERS.length);
});
