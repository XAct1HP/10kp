// Moderation audit log — one row per state transition or admin action.
// Called from every place that mutates moderation_state so the admin UI
// has a complete history without needing to reconstruct it from webhook
// logs.

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{
 *   pitchId: string,
 *   action: string,
 *   previousState?: string|null,
 *   newState?: string|null,
 *   reviewedBy?: string|null,
 *   reason?: string|null,
 *   adminNotes?: string|null,
 *   details?: any,
 * }} entry
 */
export async function writeAudit(supabaseAdmin, entry) {
  try {
    await supabaseAdmin.from("moderation_audit").insert({
      pitch_id: entry.pitchId,
      action: entry.action,
      previous_state: entry.previousState ?? null,
      new_state: entry.newState ?? null,
      reviewed_by: entry.reviewedBy ?? null,
      reason: entry.reason ?? null,
      admin_notes: entry.adminNotes ?? null,
      details: entry.details ?? null,
    });
  } catch (err) {
    // Audit failure must not break the moderation flow. Log and move on.
    console.error("[moderation.audit] failed to write entry", {
      pitchId: entry.pitchId,
      action: entry.action,
      error: err.message,
    });
  }
}
