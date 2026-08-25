import {
  applyAccountFilters,
  normalizeAccountScope,
  normalizeConfirmedFilter,
  normalizeAccountSearch,
} from "./outreach";

const AUTH_PAGE_SIZE = 200;
const PITCH_QUERY_CHUNK_SIZE = 500;

function getAdminEmailSet() {
  return new Set(
    String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function listAllAuthUsers(supabaseAdmin) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });

    if (error) {
      throw new Error(error.message || "Failed to load auth users.");
    }

    const nextUsers = data?.users || [];
    users.push(...nextUsers);

    if (nextUsers.length < AUTH_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return users;
}

async function loadPitchCountMap(supabaseAdmin, userIds) {
  const pitchCountMap = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return pitchCountMap;
  }

  for (const chunk of chunkArray(userIds, PITCH_QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("pitches")
      .select("user_id")
      .in("user_id", chunk);

    if (error) {
      throw new Error(error.message || "Failed to load pitch ownership.");
    }

    for (const row of data || []) {
      if (!row?.user_id) continue;
      pitchCountMap.set(row.user_id, (pitchCountMap.get(row.user_id) || 0) + 1);
    }
  }

  return pitchCountMap;
}

function buildAccountRecord(user, pitchCountMap, adminEmails) {
  const email = String(user?.email || "").trim().toLowerCase();
  const pitchCount = pitchCountMap.get(user.id) || 0;

  return {
    id: user.id,
    email,
    created_at: user?.created_at || null,
    email_confirmed_at: user?.email_confirmed_at || null,
    last_sign_in_at: user?.last_sign_in_at || null,
    confirmed: Boolean(user?.email_confirmed_at),
    has_pitch: pitchCount > 0,
    pitch_count: pitchCount,
    is_admin: adminEmails.has(email),
  };
}

function buildSummary(allAccounts, filteredAccounts) {
  const summarize = (accounts) => ({
    count: accounts.length,
    submitted: accounts.filter((account) => account.has_pitch).length,
    no_pitch: accounts.filter((account) => !account.has_pitch).length,
    confirmed: accounts.filter((account) => account.confirmed).length,
    unconfirmed: accounts.filter((account) => !account.confirmed).length,
    admins: accounts.filter((account) => account.is_admin).length,
  });

  return {
    total: summarize(allAccounts),
    filtered: summarize(filteredAccounts),
  };
}

// Map user_id -> email for a set of submitters. Used by the pitch CSV export,
// which needs the submitter's account email alongside the pitch row. Reuses the
// paged auth listing rather than one getUserById call per pitch.
export async function getUserEmailMap(supabaseAdmin) {
  const users = await listAllAuthUsers(supabaseAdmin);
  const map = new Map();
  for (const user of users) {
    if (user?.id && user?.email) map.set(user.id, user.email);
  }
  return map;
}

// Accounts that submitted a pitch currently in the given award track.
// Only `eligible` rows count — a selection the relevance check dropped, or an
// admin removed, is not membership in the track.
async function loadUserIdsForAward(supabaseAdmin, awardId) {
  const { data, error } = await supabaseAdmin
    .from("pitch_awards")
    .select("pitches!inner ( user_id )")
    .eq("award_id", awardId)
    .eq("status", "eligible");

  if (error) throw new Error(error.message || "Failed to load award track membership.");
  return collectUserIds(data);
}

async function loadUserIdsForTag(supabaseAdmin, tagId) {
  const { data, error } = await supabaseAdmin
    .from("pitch_tags")
    .select("pitches!inner ( user_id )")
    .eq("tag_id", tagId);

  if (error) throw new Error(error.message || "Failed to load tag membership.");
  return collectUserIds(data);
}

// PostgREST returns an embedded to-one as an object, but hands back an array
// when it can't prove uniqueness. Accept either shape.
function collectUserIds(rows) {
  const ids = new Set();
  for (const row of rows || []) {
    const pitch = Array.isArray(row?.pitches) ? row.pitches[0] : row?.pitches;
    if (pitch?.user_id) ids.add(pitch.user_id);
  }
  return ids;
}

// Both filters active = accounts satisfying BOTH, not either.
function intersect(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Set([...a].filter((id) => b.has(id)));
}

export async function listAccountsForOutreach(supabaseAdmin, filters = {}) {
  const scope = normalizeAccountScope(filters.scope);
  const confirmed = normalizeConfirmedFilter(filters.confirmed);
  const search = normalizeAccountSearch(filters.search);
  const award = String(filters.award || "").trim() || null;
  const tag = String(filters.tag || "").trim() || null;
  const adminEmails = getAdminEmailSet();

  let allowedUserIds = null;
  if (award) allowedUserIds = intersect(allowedUserIds, await loadUserIdsForAward(supabaseAdmin, award));
  if (tag) allowedUserIds = intersect(allowedUserIds, await loadUserIdsForTag(supabaseAdmin, tag));

  const users = await listAllAuthUsers(supabaseAdmin);
  const emailUsers = users.filter((user) => user?.id && user?.email);
  const pitchCountMap = await loadPitchCountMap(
    supabaseAdmin,
    emailUsers.map((user) => user.id)
  );

  const allAccounts = emailUsers.map((user) => buildAccountRecord(user, pitchCountMap, adminEmails));
  const filteredAccounts = applyAccountFilters(allAccounts, {
    scope,
    confirmed,
    search,
    allowedUserIds,
  });

  return {
    accounts: filteredAccounts,
    summary: buildSummary(allAccounts, filteredAccounts),
    filters: { scope, confirmed, search, award, tag },
  };
}

// Default display name shown to recipients in their inbox.
// Overridable via RESEND_FROM_NAME env var if a specific competition ever
// wants a different sender label.
const DEFAULT_FROM_NAME = "10,000 Pitches";

// Build an RFC 5322 "Display Name <email>" address. Quotes the name because
// it contains a comma (10,000), which is a special character in that spec.
// If the env var already provides an address in "Name <email>" form, respect
// it and don't re-wrap.
function formatFromAddress(rawFromEmail, displayName) {
  if (!rawFromEmail) return "";
  if (rawFromEmail.includes("<")) return rawFromEmail;
  const safeName = String(displayName || "").replace(/"/g, '\\"');
  return `"${safeName}" <${rawFromEmail}>`;
}

export function getResendBroadcastConfig() {
  const fromEmail = String(process.env.RESEND_FROM_EMAIL || "").trim();
  const fromName = String(process.env.RESEND_FROM_NAME || "").trim() || DEFAULT_FROM_NAME;
  return {
    apiKey: String(process.env.RESEND_API_KEY || "").trim(),
    fromEmail,
    // Preferred value to pass to Resend's `from` field — inbox shows the name.
    fromAddress: formatFromAddress(fromEmail, fromName),
    fromName,
  };
}

function isMissingRelationError(error) {
  const code = error?.code || error?.details?.code;
  const message = String(error?.message || "");
  return code === "42P01" || message.toLowerCase().includes("relation") && message.toLowerCase().includes("does not exist");
}

export async function fetchBroadcastCampaignHistory(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .select(`
      id,
      created_at,
      created_by,
      subject,
      recipient_scope,
      confirmed_filter,
      recipient_count,
      resend_segment_id,
      resend_broadcast_id,
      status,
      details
    `)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    if (isMissingRelationError(error)) {
      return { campaigns: [], historyEnabled: false };
    }
    throw new Error(error.message || "Failed to load broadcast history.");
  }

  return { campaigns: data || [], historyEnabled: true };
}

export async function insertBroadcastCampaign(supabaseAdmin, campaign) {
  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .insert(campaign)
    .select(`
      id,
      created_at,
      created_by,
      subject,
      recipient_scope,
      confirmed_filter,
      recipient_count,
      resend_segment_id,
      resend_broadcast_id,
      status,
      details
    `)
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      return { campaign: null, historyEnabled: false };
    }
    throw new Error(error.message || "Failed to save broadcast history.");
  }

  return { campaign: data, historyEnabled: true };
}
