import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";
import {
  fetchBroadcastCampaignHistory,
  getResendBroadcastConfig,
  insertBroadcastCampaign,
  listAccountsForOutreach,
} from "../../../../../lib/adminOutreach";
import {
  buildBroadcastHtml,
  buildBroadcastText,
  normalizeAccountScope,
  normalizeConfirmedFilter,
  normalizeAccountSearch,
} from "../../../../../lib/outreach";

const RESEND_API_BASE = "https://api.resend.com";
// Resend's /emails/batch accepts up to 100 messages per request.
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

// Send the broadcast via /emails/batch. This avoids Resend's segment/contact
// system entirely — previously we created a fresh segment per broadcast, which
// hits the free plan's 3-segment cap after just three sends.
async function sendBroadcastEmails({ apiKey, fromAddress, fromEmail, subject, message, recipients }) {
  const html = buildBroadcastHtml(message, { subject });
  const text = buildBroadcastText(message);
  // RFC 8058 List-Unsubscribe header. Aids deliverability and lets Gmail/
  // Apple Mail show a native "Unsubscribe" button in the header UI.
  const unsubscribeMailto = `<mailto:${fromEmail}?subject=Unsubscribe>`;

  const emailIds = [];
  for (const chunk of chunkArray(recipients, RESEND_BATCH_LIMIT)) {
    const payload = chunk.map((email) => ({
      from: fromAddress,
      to: email,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": unsubscribeMailto,
      },
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

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const resend = getResendBroadcastConfig();
    const history = await fetchBroadcastCampaignHistory(supabaseAdmin);

    return NextResponse.json({
      campaigns: history.campaigns,
      historyEnabled: history.historyEnabled,
      resendConfigured: Boolean(resend.apiKey && resend.fromEmail),
      resendFromEmail: resend.fromEmail || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load broadcast settings." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const scope = normalizeAccountScope(body.scope);
    const confirmed = normalizeConfirmedFilter(body.confirmed);
    const search = normalizeAccountSearch(body.search);

    if (!subject) {
      return NextResponse.json({ error: "Subject is required." }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
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
    const { accounts } = await listAccountsForOutreach(supabaseAdmin, {
      scope,
      confirmed,
      search,
    });

    if (accounts.length === 0) {
      return NextResponse.json({ error: "No matching accounts found." }, { status: 400 });
    }

    const recipients = accounts.map((account) => account.email);
    const emailIds = await sendBroadcastEmails({
      apiKey: resend.apiKey,
      fromAddress: resend.fromAddress,
      fromEmail: resend.fromEmail,
      subject,
      message,
      recipients,
    });

    const auditPayload = {
      created_by: auth.user.email || null,
      subject,
      body_text: message,
      recipient_scope: scope,
      confirmed_filter: confirmed,
      recipient_count: recipients.length,
      resend_segment_id: null,
      resend_broadcast_id: null,
      status: "sent",
      details: {
        delivery: "batch",
        search,
        recipient_emails_preview: recipients.slice(0, 10),
        resend_email_ids_preview: emailIds.slice(0, 10),
      },
    };

    const historyInsert = await insertBroadcastCampaign(supabaseAdmin, auditPayload);

    return NextResponse.json({
      success: true,
      recipientCount: recipients.length,
      sentCount: emailIds.length,
      historyEnabled: historyInsert.historyEnabled,
      campaign: historyInsert.campaign,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to send broadcast." },
      { status: 500 }
    );
  }
}
