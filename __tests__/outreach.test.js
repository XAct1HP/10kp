import { test } from "node:test";
import assert from "node:assert/strict";

const {
  applyAccountFilters,
  buildAccountCsv,
  buildBroadcastHtml,
  buildBroadcastText,
  buildWinnerNotificationHtml,
  buildWinnerNotificationText,
  joinEmailList,
  normalizeAccountScope,
  normalizeConfirmedFilter,
  parseEmailList,
  renderBrandedEmail,
  WINNER_SURVEY_URL,
} = await import("../lib/outreach.js");

const accounts = [
  {
    id: "1",
    email: "founder1@umich.edu",
    created_at: "2026-08-03T12:00:00.000Z",
    confirmed: true,
    has_pitch: true,
    pitch_count: 2,
    is_admin: false,
  },
  {
    id: "2",
    email: "founder2@umich.edu",
    created_at: "2026-08-02T12:00:00.000Z",
    confirmed: false,
    has_pitch: false,
    pitch_count: 0,
    is_admin: false,
  },
];

test("normalize helpers fall back to safe defaults", () => {
  assert.equal(normalizeAccountScope("mystery"), "all");
  assert.equal(normalizeConfirmedFilter("later"), "all");
});

test("applyAccountFilters narrows by scope and confirmed status", () => {
  const filtered = applyAccountFilters(accounts, {
    scope: "submitted",
    confirmed: "confirmed",
    search: "",
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].email, "founder1@umich.edu");
});

test("applyAccountFilters matches email search", () => {
  const filtered = applyAccountFilters(accounts, {
    scope: "all",
    confirmed: "all",
    search: "founder2",
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].email, "founder2@umich.edu");
});

test("buildAccountCsv includes stable headers and values", () => {
  const csv = buildAccountCsv(accounts.slice(0, 1));
  assert.match(csv, /Email,Created At,Email Confirmed,Last Sign In,Submitted Pitch,Pitch Count,Admin Account/);
  assert.match(csv, /founder1@umich\.edu/);
  assert.match(csv, /Yes/);
});

test("buildBroadcastText appends unsubscribe placeholder", () => {
  const text = buildBroadcastText("Reminder");
  assert.match(text, /Reminder/);
  assert.match(text, /RESEND_UNSUBSCRIBE_URL/);
});

test("parseEmailList normalizes and deduplicates recipients", () => {
  const emails = parseEmailList("Foo@umich.edu\nbar@umich.edu, foo@umich.edu");
  assert.deepEqual(emails, ["foo@umich.edu", "bar@umich.edu"]);
});

test("joinEmailList appends unique emails", () => {
  const joined = joinEmailList("foo@umich.edu", ["bar@umich.edu", "foo@umich.edu"]);
  assert.equal(joined, "foo@umich.edu\nbar@umich.edu");
});

test("buildWinnerNotificationText includes survey link", () => {
  const text = buildWinnerNotificationText({
    prizeLabel: "Weekly Raffle",
    note: "Please complete this by Friday.",
  });
  assert.match(text, /Weekly Raffle/);
  assert.match(text, new RegExp(WINNER_SURVEY_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(text, /Friday/);
});

test("renderBrandedEmail includes logo, navy title, and org footer", () => {
  const html = renderBrandedEmail({
    title: "Hello there",
    bodyHtml: "<p>Body content.</p>",
  });
  assert.match(html, /10kp_email_logo\.png/);
  assert.match(html, /Hello there/);
  assert.match(html, /#00274C/);
  assert.match(html, /Center for Entrepreneurship/);
});

test("renderBrandedEmail escapes the title", () => {
  const html = renderBrandedEmail({ title: "<script>x</script>", bodyHtml: "<p>ok</p>" });
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderBrandedEmail includes CTA button when provided", () => {
  const html = renderBrandedEmail({
    title: "T",
    bodyHtml: "<p>b</p>",
    cta: { label: "Do the thing", url: "https://example.com/x" },
  });
  assert.match(html, /Do the thing/);
  assert.match(html, /https:\/\/example\.com\/x/);
  assert.match(html, /#FFCB05/);
});

test("buildBroadcastHtml uses subject as title and keeps unsubscribe placeholder", () => {
  const html = buildBroadcastHtml("Hello everyone.\n\nSecond paragraph.", {
    subject: "Weekly update",
  });
  assert.match(html, /Weekly update/);
  assert.match(html, /Hello everyone\./);
  assert.match(html, /Second paragraph\./);
  assert.match(html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
});

test("buildWinnerNotificationHtml uses branded template with survey CTA", () => {
  const html = buildWinnerNotificationHtml({
    prizeLabel: "Grand Prize",
    note: "Reply if you need help.",
  });
  assert.match(html, /Congratulations!/);
  assert.match(html, /Grand Prize/);
  assert.match(html, /Complete Payment Survey/);
  assert.match(html, new RegExp(WINNER_SURVEY_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Reply if you need help/);
  assert.match(html, /10kp_email_logo\.png/);
});
