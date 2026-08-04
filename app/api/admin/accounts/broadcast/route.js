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
const CONTACT_CONCURRENCY = 5;

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

async function createResendSegment(apiKey, name) {
  const data = await resendRequest("/segments", {
    apiKey,
    method: "POST",
    body: { name },
  });
  return data.id;
}

async function getResendContactByEmail(apiKey, email) {
  return resendRequest(`/contacts/${encodeURIComponent(email)}`, { apiKey });
}

async function createResendContact(apiKey, email) {
  return resendRequest("/contacts", {
    apiKey,
    method: "POST",
    body: {
      email,
      unsubscribed: false,
    },
  });
}

async function addContactToSegment(apiKey, contactId, segmentId) {
  return resendRequest(
    `/contacts/${encodeURIComponent(contactId)}/segments/${encodeURIComponent(segmentId)}`,
    { apiKey, method: "POST" }
  );
}

function isConflictError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 409 || message.includes("already exists") || message.includes("already in");
}

async function ensureContactInSegment(apiKey, email, segmentId) {
  let contactId = null;

  try {
    const created = await createResendContact(apiKey, email);
    contactId = created?.id || null;
  } catch (error) {
    if (!isConflictError(error)) throw error;
    const existing = await getResendContactByEmail(apiKey, email);
    contactId = existing?.id || null;
  }

  if (!contactId) {
    throw new Error(`Could not resolve a Resend contact for ${email}.`);
  }

  try {
    await addContactToSegment(apiKey, contactId, segmentId);
  } catch (error) {
    if (!isConflictError(error)) throw error;
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = [...items];
  const failures = [];

  async function consume() {
    while (queue.length > 0) {
      const next = queue.shift();
      try {
        await worker(next);
      } catch (error) {
        failures.push({
          email: next?.email || null,
          message: error.message || "Unknown Resend error.",
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, () => consume())
  );

  return failures;
}

async function createAndSendBroadcast({ apiKey, fromEmail, subject, message, segmentId }) {
  return resendRequest("/broadcasts", {
    apiKey,
    method: "POST",
    body: {
      segment_id: segmentId,
      from: fromEmail,
      subject,
      name: `${subject} (${new Date().toISOString()})`,
      html: buildBroadcastHtml(message),
      text: buildBroadcastText(message),
      send: true,
    },
  });
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

    const segmentId = await createResendSegment(
      resend.apiKey,
      `10KP ${subject.slice(0, 60)} ${new Date().toISOString()}`
    );

    const failures = await runWithConcurrency(accounts, CONTACT_CONCURRENCY, async (account) => {
      await ensureContactInSegment(resend.apiKey, account.email, segmentId);
    });

    if (failures.length > 0) {
      return NextResponse.json(
        {
          error: `Failed to prepare ${failures.length} recipient${failures.length === 1 ? "" : "s"} for broadcast.`,
          failures: failures.slice(0, 10),
        },
        { status: 500 }
      );
    }

    const broadcast = await createAndSendBroadcast({
      apiKey: resend.apiKey,
      fromEmail: resend.fromEmail,
      subject,
      message,
      segmentId,
    });

    const auditPayload = {
      created_by: auth.user.email || null,
      subject,
      body_text: message,
      recipient_scope: scope,
      confirmed_filter: confirmed,
      recipient_count: accounts.length,
      resend_segment_id: segmentId,
      resend_broadcast_id: broadcast?.id || null,
      status: "sent",
      details: {
        search,
        recipient_emails_preview: accounts.slice(0, 10).map((account) => account.email),
      },
    };

    const historyInsert = await insertBroadcastCampaign(supabaseAdmin, auditPayload);

    return NextResponse.json({
      success: true,
      broadcastId: broadcast?.id || null,
      segmentId,
      recipientCount: accounts.length,
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
