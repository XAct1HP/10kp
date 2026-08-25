// CSV export for admin pitch submissions.
//
// Kept out of the admin page component so the column set is testable and so
// there is one obvious place to add a field when the application form grows.
// The header order below is the contract the organizers' spreadsheet expects —
// append new columns at the end rather than inserting them in the middle.

const UMICH_DOMAIN = "@umich.edu";

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

// CSV cells cannot carry newlines cleanly across every spreadsheet importer,
// so long free-text fields are flattened to single lines.
function flatten(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function formatUniqnameEmail(uniqname) {
  const cleaned = String(uniqname || "").trim().toLowerCase();
  return cleaned ? `${cleaned}${UMICH_DOMAIN}` : "";
}

export function formatTeammates(teammates) {
  return (Array.isArray(teammates) ? teammates : [])
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean)
    .join("; ");
}

// The supervisor asked for a plain flagged / not-flagged read. The raw
// moderation status ships alongside it so nothing is lost.
export function formatModerationResult(pitch) {
  return pitch?.moderation_status === "flagged" ? "Flagged" : "Not flagged";
}

export function buildSubmissionLink(pitch, origin) {
  if (!pitch?.id) return "";
  return `${origin || ""}/gallery?pitch=${encodeURIComponent(pitch.id)}`;
}

// Text-only submissions have no file, so they get a blank cell rather than a
// link that resolves to an error. Everything else routes through the admin
// file resolver, which mints a fresh signed URL at click time — the link
// itself never expires.
export function buildPitchFileLink(pitch, origin) {
  if (!pitch?.id) return "";
  if (!pitch.file_path && !pitch.mux_playback_id) return "";
  return `${origin || ""}/admin/file/${encodeURIComponent(pitch.id)}`;
}

// Award tracks a pitch is actually in, versus ones it asked for and was
// dropped from. Both ship: organizers judging a track need the first, and the
// second is what you look at when a submitter asks why they aren't listed.
export function formatAwardTracks(pitch, status) {
  return (Array.isArray(pitch?.award_tracks) ? pitch.award_tracks : [])
    .filter((track) => track?.status === status)
    .map((track) => track.name)
    .filter(Boolean)
    .join("; ");
}

export const PITCH_CSV_HEADERS = [
  "Submitted At",
  "Name",
  "Uniqname",
  "Uniqname Email",
  "Account Email",
  "Teammate Uniqnames",
  "Teammate Count",
  "Role",
  "Student Level",
  "Schools",
  "Pitch Title",
  "Pitch Description",
  "Tags",
  "Pitch Type",
  "File Name",
  "Text Submission",
  "Has Thumbnail",
  "Link to Submission",
  "Link to Pitch File",
  "Votes",
  "Moderation Result",
  "Moderation Status",
  "Moderation Reason",
  "Media Status",
  "Pitch ID",
  "Award Tracks",
  "Award Tracks Removed",
];

export function buildPitchRow(pitch, origin) {
  const teammates = Array.isArray(pitch.teammate_uniqnames)
    ? pitch.teammate_uniqnames.filter(Boolean)
    : [];

  return [
    formatTimestamp(pitch.created_at),
    flatten(pitch.name),
    String(pitch.uniqname || "").trim().toLowerCase(),
    formatUniqnameEmail(pitch.uniqname),
    String(pitch.submitter_email || "").trim().toLowerCase(),
    formatTeammates(teammates),
    teammates.length,
    pitch.role || "",
    pitch.student_level || "",
    (pitch.schools || []).join("; "),
    flatten(pitch.title),
    flatten(pitch.description),
    (pitch.tags || []).map((tag) => tag?.name).filter(Boolean).join("; "),
    pitch.file_type || "file",
    pitch.file_name || "",
    flatten(pitch.text_content),
    pitch.thumbnail_path ? "Yes" : "No",
    buildSubmissionLink(pitch, origin),
    buildPitchFileLink(pitch, origin),
    pitch.vote_count || 0,
    formatModerationResult(pitch),
    pitch.moderation_status || "",
    flatten(pitch.moderation_reason),
    pitch.mux_status || "",
    pitch.id || "",
    formatAwardTracks(pitch, "eligible"),
    formatAwardTracks(pitch, "removed"),
  ];
}

export function buildPitchCsv(pitches, origin = "") {
  const rows = (pitches || []).map((pitch) => buildPitchRow(pitch, origin));
  return [
    PITCH_CSV_HEADERS.join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");
}
