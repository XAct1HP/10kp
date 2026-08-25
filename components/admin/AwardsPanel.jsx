"use client";

import { useEffect, useMemo, useState } from "react";

function GlassCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: "rgba(11,26,59,0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </div>
  );
}

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
};

function IconButton({ onClick, disabled, label, danger, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-40"
      style={{
        color: danger ? "rgba(252,165,165,0.85)" : "rgba(255,255,255,0.55)",
        background: danger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${danger ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)"}`,
      }}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
    </svg>
  );
}

/**
 * AwardsPanel — CRUD for award definitions.
 *
 * Wrapped in a single GlassCard so it visually matches Competition
 * Dates / Default Thumbnails / Administrators / Sponsors. Item tiles
 * share the same fixed dimensions as sponsor tiles.
 */
export default function AwardsPanel({ apiFetch, onError, onSuccess }) {
  const [awards, setAwards] = useState([]);
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    prize: "",
    sort_order: 0,
    is_active: true,
    is_raffle: false,
    match_criteria: "",
    sponsor_ids: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [awardsData, sponsorsData] = await Promise.all([
        apiFetch("/api/admin/awards"),
        apiFetch("/api/admin/sponsors"),
      ]);
      setAwards(awardsData || []);
      setSponsors(sponsorsData || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const sponsorsById = useMemo(() => {
    const m = new Map();
    sponsors.forEach((s) => m.set(s.id, s));
    return m;
  }, [sponsors]);

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      prize: "",
      sort_order: 0,
      is_active: true,
      is_raffle: false,
      match_criteria: "",
      sponsor_ids: [],
    });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (award) => {
    setEditing(award);
    setForm({
      name: award.name || "",
      description: award.description || "",
      prize: award.prize || "",
      sort_order: award.sort_order || 0,
      is_active: award.is_active !== false,
      is_raffle: award.is_raffle === true,
      match_criteria: award.match_criteria || "",
      sponsor_ids: (award.sponsors || []).map((s) => s.id),
    });
    setShowForm(true);
  };

  const toggleSponsor = (id) => {
    setForm((f) => {
      const has = f.sponsor_ids.includes(id);
      return {
        ...f,
        sponsor_ids: has ? f.sponsor_ids.filter((x) => x !== id) : [...f.sponsor_ids, id],
      };
    });
  };

  const moveSponsor = (id, direction) => {
    setForm((f) => {
      const list = [...f.sponsor_ids];
      const idx = list.indexOf(id);
      if (idx < 0) return f;
      const target = idx + direction;
      if (target < 0 || target >= list.length) return f;
      [list[idx], list[target]] = [list[target], list[idx]];
      return { ...f, sponsor_ids: list };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        prize: form.prize.trim() || null,
        sort_order: Number(form.sort_order) || 0,
        is_active: !!form.is_active,
        is_raffle: !!form.is_raffle,
        // The raffle is auto-entry, so its criteria are never scored. Clear
        // them rather than leaving a stale rubric behind if an award is
        // converted into the raffle.
        match_criteria: form.is_raffle ? "" : form.match_criteria.trim(),
        sponsor_ids: form.sponsor_ids,
      };
      if (editing) {
        await apiFetch("/api/admin/awards", {
          method: "PUT",
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
        onSuccess?.("Award updated");
      } else {
        await apiFetch("/api/admin/awards", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onSuccess?.("Award created");
      }
      resetForm();
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (award) => {
    if (!confirm(`Delete award "${award.name}"?`)) return;
    setDeletingId(award.id);
    try {
      await apiFetch(`/api/admin/awards?id=${award.id}`, { method: "DELETE" });
      onSuccess?.("Award deleted");
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Awards</h2>
          <p className="text-xs text-white/40 mt-0.5">
            Award definitions shown on the Rules page. Attach sponsors so their logos appear alongside.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 flex-shrink-0"
            style={{ background: "#FFCB05" }}
          >
            + Add award
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-white">
                {editing ? "Edit award" : "New award"}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Award name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Weekly Raffle Winner"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Awarded weekly to a randomly selected participant..."
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize resize-none"
                  style={inputStyle}
                />
                <p className="text-[11px] text-white/35 mt-1.5">
                  Public. Shown on the Rules page and under this award on the
                  submission form &mdash; keep it to a sentence or two so students
                  can tell at a glance whether their pitch belongs here.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Prize (optional)</label>
                  <input
                    value={form.prize}
                    onChange={(e) => setForm({ ...form, prize: e.target.value })}
                    placeholder="$500 + coaching session"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Sort order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 accent-maize"
                />
                Active (show on Rules page)
              </label>

              {/* Auto-entry (raffle) toggle. Exactly one award can hold this
                  flag; the API clears it from any other award on save. */}
              <div
                className="rounded-lg p-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <label className="flex items-start gap-2 text-sm text-white/75 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_raffle}
                    onChange={(e) => setForm({ ...form, is_raffle: e.target.checked })}
                    className="w-4 h-4 accent-maize mt-0.5 flex-shrink-0"
                  />
                  <span>
                    Automatic entry (the Weekly Raffle)
                    <span className="block text-[11px] text-white/40 mt-1 leading-relaxed">
                      Every approved pitch is entered. This award is hidden from the
                      submission form&rsquo;s award picker and skipped by the relevance
                      check &mdash; no criteria needed. Only one award can be the
                      automatic-entry award.
                    </span>
                  </span>
                </label>
              </div>

              {/* AI matching criteria — admin-only, never sent to the browser
                  for non-admins (stored in the award_criteria table). */}
              {!form.is_raffle && (
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                    Relevance criteria (admin only)
                  </label>
                  <textarea
                    value={form.match_criteria}
                    onChange={(e) => setForm({ ...form, match_criteria: e.target.value })}
                    rows={4}
                    placeholder={"What must a pitch actually be about to belong in this track?\n\ne.g. The pitch must center on a physical product, device, or piece of hardware the team would build or manufacture. Software-only ideas, services, and app concepts do not qualify, even if a device is mentioned in passing."}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize resize-y"
                    style={inputStyle}
                  />
                  <p className="text-[11px] text-white/35 mt-1.5">
                    Never shown to students. After a pitch clears moderation, its
                    transcript or text is scored against this &mdash; pitches that
                    don&rsquo;t fit are dropped from the track automatically. Be
                    concrete about what counts and what doesn&rsquo;t. Leave blank to
                    score against the public description instead.
                  </p>
                </div>
              )}

              {/* Sponsor selector */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-2">
                  Sponsors ({form.sponsor_ids.length} selected)
                </label>
                {sponsors.length === 0 ? (
                  <p className="text-xs text-white/40 italic p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                    No sponsors yet. Add sponsors in the Sponsors section first, then edit this award to attach them.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Selected (in order) */}
                    {form.sponsor_ids.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {form.sponsor_ids.map((id, idx) => {
                          const s = sponsorsById.get(id);
                          if (!s) return null;
                          return (
                            <div
                              key={id}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg"
                              style={{ background: "rgba(255,203,5,0.08)", border: "1px solid rgba(255,203,5,0.25)" }}
                            >
                              <span className="text-xs text-white/40 tabular-nums">#{idx + 1}</span>
                              {s.logo_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.logo_url} alt="" className="w-6 h-6 object-contain" />
                              )}
                              <span className="flex-1 text-sm text-white">{s.name}</span>
                              <button
                                type="button"
                                onClick={() => moveSponsor(id, -1)}
                                disabled={idx === 0}
                                className="text-xs text-white/50 hover:text-white disabled:opacity-20 px-1.5"
                                aria-label="Move up"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSponsor(id, 1)}
                                disabled={idx === form.sponsor_ids.length - 1}
                                className="text-xs text-white/50 hover:text-white disabled:opacity-20 px-1.5"
                                aria-label="Move down"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleSponsor(id)}
                                className="text-xs text-red-300 hover:text-red-200 px-1.5"
                                aria-label="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Available */}
                    <div className="flex flex-wrap gap-1.5">
                      {sponsors
                        .filter((s) => !form.sponsor_ids.includes(s.id))
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleSponsor(s.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:text-white transition-colors"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
                          >
                            {s.logo_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.logo_url} alt="" className="w-4 h-4 object-contain" />
                            )}
                            + {s.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !form.name.trim()}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                style={{ background: "#FFCB05" }}
              >
                {submitting ? "Saving..." : editing ? "Save changes" : "Create award"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-white/40 text-sm">Loading awards...</p>
      ) : awards.length === 0 ? (
        <div
          className="rounded-xl py-8 px-4 text-center"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}
        >
          <p className="text-sm text-white/50">No awards yet.</p>
          <p className="text-xs text-white/30 mt-1">Create one above to have it appear on the Rules page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {awards.map((award) => (
            <div
              key={award.id}
              className="relative rounded-xl p-3 flex flex-col h-44"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Actions — small icons top-right */}
              <div className="absolute top-2 right-2 flex gap-1">
                <IconButton onClick={() => startEdit(award)} label="Edit award">
                  <PencilIcon />
                </IconButton>
                <IconButton
                  onClick={() => handleDelete(award)}
                  disabled={deletingId === award.id}
                  label="Delete award"
                  danger
                >
                  <TrashIcon />
                </IconButton>
              </div>

              {/* Content — leaves room for actions in the top-right */}
              <div className="flex-1 min-h-0 flex flex-col pr-16">
                <div className="flex items-center gap-1.5 mb-1">
                  <h3 className="text-sm font-bold text-white truncate">{award.name}</h3>
                  {award.is_raffle && (
                    <span
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 font-semibold"
                      style={{ background: "rgba(255,203,5,0.15)", color: "#FFCB05" }}
                      title="Every approved pitch is entered automatically"
                    >
                      Auto
                    </span>
                  )}
                  {!award.is_active && (
                    <span
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded text-white/50 flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                    >
                      Off
                    </span>
                  )}
                </div>
                {award.prize && (
                  <p className="text-[11px] font-semibold text-maize mb-1 truncate">{award.prize}</p>
                )}
                {award.description && (
                  <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3">{award.description}</p>
                )}
              </div>

              {/* An award with no criteria and no description has nothing to
                  score against — the relevance check would pass everything. */}
              {!award.is_raffle && !award.match_criteria && !award.description && (
                <p className="text-[10px] text-amber-300/70 mt-1">
                  No relevance criteria &mdash; every selection is accepted.
                </p>
              )}

              {/* Sponsor logos footer */}
              {award.sponsors?.length > 0 && (
                <div
                  className="flex items-center gap-1.5 mt-2 pt-2"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {award.sponsors.slice(0, 4).map((s) =>
                    s.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={s.id}
                        src={s.logo_url}
                        alt={s.name}
                        title={s.name}
                        className="w-5 h-5 object-contain rounded"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      />
                    ) : (
                      <span
                        key={s.id}
                        title={s.name}
                        className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-black"
                        style={{ background: "#FFCB05" }}
                      >
                        {s.name.charAt(0)}
                      </span>
                    )
                  )}
                  {award.sponsors.length > 4 && (
                    <span className="text-[10px] text-white/40">+{award.sponsors.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
