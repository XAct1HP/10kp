// Shared helpers for virtual event links (admin API + bulletin card).

// Accepts what an admin pastes ("umich.zoom.us/j/123" or a full URL) and
// returns a clean http(s) URL, null for blank input, or throws on garbage.
export function normalizeMeetingUrl(raw) {
  if (raw == null) return null;
  let v = String(raw).trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new Error("Meeting link is not a valid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Meeting link must start with http:// or https://");
  }
  if (!u.hostname.includes(".")) {
    throw new Error("Meeting link is not a valid URL");
  }
  return u.toString();
}

// Button label for a meeting link, based on the platform it points at.
export function meetingButtonLabel(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "Join online";
  }
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Join on Zoom";
  if (host === "meet.google.com") return "Join on Google Meet";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Join on Teams";
  if (host.endsWith("webex.com")) return "Join on Webex";
  return "Join online";
}
