import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";
import {
  getResendBroadcastConfig,
  insertBroadcastCampaign,
  listAccountsForOutreach,
} from "../../../../../lib/adminOutreach";
import {
  WINNER_SURVEY_URL,
  buildWinnerNotificationHtml,
  buildWinnerNotificationText,
  parseEmailList,
} from "../../../../../lib/outreach";

const RESEND_API_BASE = "https://api.resend.com";
const RESEND_BATCH_LIMIT = 100;

async function resendRequest(path, { apiKey, method = "GET", body } = {}) {
  const response = await fetch(`${RESEND_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || data?.error || `Resend request failed (${response.status})`
    );
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function sendWinnerEmails({ apiKey, fromEmail, recipients, subject, prizeLabel, note }) {
  const html = buildWinnerNotificationHtml({ prizeLabel, note });
  const text = buildWinnerNotificationText({ prizeLabel, note });
  const emailIds = [];

  for (const chunk of chunkArray(recipients, RESEND_BATCH_LIMIT)) {
    const payload = chunk.map((email) => ({
      from: fromEmail,
      to: email,
      subject,
      html,
      text,
    }));

    const data = await resendRequest("/emails/batch", {
      apiKey,
      method: "POST",
      body: payload,
    });

    for (const entry of data?.data || []) {
      if (entry?.id) emailIds.push(entry.id);
    }
  }

  return emailIds;
}

export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const subject = String(body.subject || "").trim();
    const prizeLabel = String(body.prizeLabel || "").trim();
    const note = String(body.note || "").trim();
    const recipients = parseEmailList(body.recipients);

    if (!subject) {
      return NextResponse.json({ error: "Subject is required." }, { status: 400 });
    }
    if (!prizeLabel) {
      return NextResponse.json({ error: "Prize label is required." }, { status: 400 });
    }
    if (recipients.length === 0) {
      return NextResponse.json({ error: "Add at least one winner email." }, { status: 400 });
    }

    const resend = getResendBroadcastConfig();
    if (!resend.apiKey || !resend.fromEmail) {
      return NextResponse.json(
        {
          error: "Resend is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL first.",
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { accounts } = await listAccountsForOutreach(supabaseAdmin, { scope: "all" });
    const accountEmails = new Set((accounts || []).map((account) => account.email));
    const unknownRecipients = recipients.filter((email) => !accountEmails.has(email));

    if (unknownRecipients.length > 0) {
      return NextResponse.json(
        {
          error: `These emails do not belong to 10KP accounts: ${unknownRecipients.slice(0, 10).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const emailIds = await sendWinnerEmails({
      apiKey: resend.apiKey,
      fromEmail: resend.fromEmail,
      recipients,
      subject,
      prizeLabel,
      note,
    });

    const historyInsert = await insertBroadcastCampaign(supabaseAdmin, {
      created_by: auth.user.email || null,
      subject,
      body_text: buildWinnerNotificationText({ prizeLabel, note }),
      recipient_scope: "winner_notification",
      confirmed_filter: "not_applicable",
      recipient_count: recipients.length,
      resend_segment_id: null,
      resend_broadcast_id: null,
      status: "winner_notification_sent",
      details: {
        type: "winner_notification",
        prizeLabel,
        note,
        surveyUrl: WINNER_SURVEY_URL,
        recipient_emails_preview: recipients.slice(0, 10),
        resend_email_ids_preview: emailIds.slice(0, 10),
      },
    });

    return NextResponse.json({
      success: true,
      recipientCount: recipients.length,
      surveyUrl: WINNER_SURVEY_URL,
      historyEnabled: historyInsert.historyEnabled,
      campaign: historyInsert.campaign,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to notify winners." },
      { status: 500 }
    );
  }
}
