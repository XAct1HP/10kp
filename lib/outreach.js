export const ACCOUNT_SCOPE_VALUES = ["all", "submitted", "no_pitch"];
export const ACCOUNT_CONFIRMED_VALUES = ["all", "confirmed", "unconfirmed"];
export const WINNER_SURVEY_URL = "https://zfrmz.com/he9A1nVASc7svnqd9dic";

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

// ── Branded email template ──────────────────────────────────────────
// Shared layout used by every outbound admin email (broadcasts, winner
// notifications, and — via Supabase's own template config — the account
// verification email). Mirrors the verification email design: logo header,
// navy title, body content, optional maize CTA, footer.
const BRAND_LOGO_URL = "https://10kpitches.com/10kp_email_logo.png";
const BRAND_NAVY = "#00274C";
const BRAND_MAIZE = "#FFCB05";

// Turn a plain-text message into paragraph HTML (blank lines split paragraphs;
// single newlines become <br />).
function messageToParagraphs(message) {
  const blocks = String(message || "")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) return "";

  return blocks
    .map(
      (block) =>
        `<p style="margin:0 0 18px 0;color:#374151;font-size:16px;line-height:1.7;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`
    )
    .join("");
}

/**
 * Render an email using the shared branded template.
 *
 * @param {object} opts
 * @param {string} opts.title       Big navy headline shown under the logo.
 * @param {string} opts.bodyHtml    Sanitized HTML for the body region.
 * @param {{label: string, url: string}} [opts.cta]  Optional maize CTA button.
 * @param {string} [opts.footerNote]  Optional footer line (raw HTML — used
 *                                    for unsubscribe links, transactional
 *                                    notes, etc.). Placed above the org line.
 */
export function renderBrandedEmail({ title, bodyHtml, cta, footerNote } = {}) {
  const safeTitle = escapeHtml(title || "10,000 Pitches");
  const ctaBlock = cta && cta.url
    ? `
        <div style="text-align:center;margin:40px 0;">
          <a href="${escapeHtml(cta.url)}" style="background:${BRAND_MAIZE};color:${BRAND_NAVY};display:inline-block;padding:16px 36px;font-size:17px;font-weight:700;text-decoration:none;border-radius:10px;">
            ${escapeHtml(cta.label || "Open")}
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:0;">
      `
    : "";
  const footerLine = footerNote
    ? `<p style="margin:0 0 12px 0;font-size:14px;color:#6B7280;line-height:1.6;">${footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
<tr>
<td align="center" style="padding:48px 40px 24px 40px;">
<img src="${BRAND_LOGO_URL}" alt="10,000 Pitches" width="220" style="display:block;border:0;outline:none;text-decoration:none;margin-bottom:30px;">
<h1 style="margin:0;color:${BRAND_NAVY};font-size:30px;font-weight:700;line-height:1.2;">
${safeTitle}
</h1>
</td>
</tr>
<tr>
<td style="padding:0 48px;">
${bodyHtml || ""}
${ctaBlock}
${ctaBlock ? "" : `<hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0 0;">`}
</td>
</tr>
<tr>
<td style="padding:32px 48px 40px 48px;text-align:center;">
${footerLine}
<p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.6;">
10,000 Pitches<br>
University of Michigan Center for Entrepreneurship
</p>
</td>
</tr>
</table>
<p style="margin-top:24px;font-size:12px;color:#9CA3AF;">
This is an automated message. Please do not reply to this email.
</p>
</td>
</tr>
</table>
</body>
</html>`;
}

export function buildBroadcastHtml(message, { subject } = {}) {
  const title = String(subject || "").trim() || "A message from 10,000 Pitches";
  const bodyHtml = messageToParagraphs(message);
  return renderBrandedEmail({
    title,
    bodyHtml,
    footerNote:
      `Manage your subscription: <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${BRAND_NAVY};text-decoration:underline;">unsubscribe</a>.`,
  });
}

export function buildBroadcastText(message) {
  const trimmed = String(message || "").trim();
  return `${trimmed}\n\nManage your subscription: {{{RESEND_UNSUBSCRIBE_URL}}}`;
}

export function parseEmailList(value) {
  const emails = String(value || "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(emails)].filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function joinEmailList(existingValue, emailsToAdd) {
  const merged = [...parseEmailList(existingValue), ...parseEmailList(emailsToAdd)];
  return [...new Set(merged)].join("\n");
}

export function buildWinnerNotificationText({ prizeLabel, note, surveyUrl = WINNER_SURVEY_URL } = {}) {
  const normalizedPrizeLabel = String(prizeLabel || "10KP").trim();
  const normalizedNote = String(note || "").trim();

  return [
    `Congratulations! You have been selected as a winner for ${normalizedPrizeLabel}.`,
    `To receive your payment, please complete the university payment survey here:`,
    surveyUrl,
    normalizedNote || null,
    `Please complete the form as soon as you can so the university can process your payment.`,
    `If you have questions, reply to this email.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildWinnerNotificationHtml({ prizeLabel, note, surveyUrl = WINNER_SURVEY_URL } = {}) {
  const normalizedPrizeLabel = String(prizeLabel || "10KP").trim();
  const normalizedNote = String(note || "").trim();

  const bodyParagraphs = [
    `<p style="margin:0 0 18px 0;color:#374151;font-size:17px;line-height:1.7;">Congratulations! You&apos;ve been selected as a winner for <strong>${escapeHtml(normalizedPrizeLabel)}</strong>.</p>`,
    `<p style="margin:0 0 32px 0;color:#4B5563;font-size:16px;line-height:1.7;">To receive your payment, please complete the University of Michigan payment survey. It only takes a couple of minutes.</p>`,
    normalizedNote
      ? `<p style="margin:0 0 24px 0;padding:16px 20px;color:#374151;font-size:15px;line-height:1.6;background:#FFF9E6;border-left:3px solid ${BRAND_MAIZE};border-radius:6px;">${escapeHtml(normalizedNote).replace(/\n/g, "<br />")}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return renderBrandedEmail({
    title: "Congratulations!",
    bodyHtml: bodyParagraphs,
    cta: { label: "Complete Payment Survey", url: surveyUrl },
    footerNote:
      "Please complete the survey soon so the university can process your payment. If you have questions, just reply to this email.",
  });
}
