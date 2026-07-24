// vttToPlainText unit tests.
import { test } from "node:test";
import assert from "node:assert/strict";

const { vttToPlainText } = await import("../lib/moderation/transcript.js");

test("strips WEBVTT header and cue numbers", () => {
  const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Hello world

2
00:00:04.000 --> 00:00:05.000
This is a pitch.`;
  const out = vttToPlainText(vtt);
  assert.equal(out, "Hello world This is a pitch.");
});

test("returns empty string for empty input", () => {
  assert.equal(vttToPlainText(""), "");
  assert.equal(vttToPlainText(null), "");
});

test("strips speaker tags and NOTE lines", () => {
  const vtt = `WEBVTT

NOTE This is a comment

1
00:00:01.000 --> 00:00:03.000
<c.speaker>Hello</c>`;
  const out = vttToPlainText(vtt);
  assert.equal(out, "Hello");
});
