export const ACCOUNT_SCOPE_VALUES = ["all", "submitted", "no_pitch"];
export const ACCOUNT_CONFIRMED_VALUES = ["all", "confirmed", "unconfirmed"];

export function normalizeAccountScope(value) {
  return ACCOUNT_SCOPE_VALUES.includes(value) ? value : "all";
}

export function normalizeConfirmedFilter(value) {
  return ACCOUNT_CONFIRMED_VALUES.includes(value) ? value : "all";
}

export function normalizeAccountSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export function sortAccountsByCreatedAt(accounts) {
  return [...accounts].sort((a, b) => {
    const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

export function applyAccountFilters(accounts, { scope, confirmed, search } = {}) {
  const normalizedScope = normalizeAccountScope(scope);
  const normalizedConfirmed = normalizeConfirmedFilter(confirmed);
  const normalizedSearch = normalizeAccountSearch(search);

  return sortAccountsByCreatedAt(
    (accounts || []).filter((account) => {
      if (normalizedScope === "submitted" && !account.has_pitch) return false;
      if (normalizedScope === "no_pitch" && account.has_pitch) return false;
      if (normalizedConfirmed === "confirmed" && !account.confirmed) return false;
      if (normalizedConfirmed === "unconfirmed" && account.confirmed) return false;
      if (normalizedSearch && !String(account.email || "").toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    })
  );
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildAccountCsv(accounts) {
  const headers = [
    "Email",
    "Created At",
    "Email Confirmed",
    "Last Sign In",
    "Submitted Pitch",
    "Pitch Count",
    "Admin Account",
  ];

  const rows = (accounts || []).map((account) => [
    account.email || "",
    account.created_at || "",
    account.email_confirmed_at || "",
    account.last_sign_in_at || "",
    account.has_pitch ? "Yes" : "No",
    account.pitch_count || 0,
    account.is_admin ? "Yes" : "No",
  ]);

  return [headers.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildBroadcastHtml(message) {
  const blocks = String(message || "")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const body = blocks.length
    ? blocks
        .map((block) => `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
        .join("")
    : `<p style="margin:0 0 16px;">${escapeHtml(message)}</p>`;

  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f172a;">`,
    body,
    `<p style="margin:24px 0 0;font-size:12px;color:#64748b;">`,
    `Manage your subscription: <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#2563eb;">unsubscribe</a>.`,
    `</p>`,
    `</div>`,
  ].join("");
}

export function buildBroadcastText(message) {
  const trimmed = String(message || "").trim();
  return `${trimmed}\n\nManage your subscription: {{{RESEND_UNSUBSCRIBE_URL}}}`;
}
