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

/**
 * AwardsPanel — CRUD for award definitions.
 *
 * Each award may attach one or more sponsors (from the Sponsors panel).
 * Awards created here populate the Awards section on the public Rules page.
 *
 * Props:
 *   apiFetch: (url, opts?) => Promise — admin page's authenticated JSON fetch
 *   onError, onSuccess: (msg: string) => void
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
    setForm({ name: "", description: "", prize: "", sort_order: 0, is_active: true, sponsor_ids: [] });
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
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto no-scrollbar pr-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">Awards</h2>
          <p className="text-xs text-white/40 mt-0.5">
            Award definitions shown on the Rules page. Attach sponsors so their logos appear alongside.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
            style={{ background: "#FFCB05" }}
          >
            + Add Award
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <GlassCard>
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
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Awarded weekly to a randomly selected participant..."
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize resize-none"
                  style={inputStyle}
                />
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

              {/* Sponsor selector */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-2">
                  Sponsors ({form.sponsor_ids.length} selected)
                </label>
                {sponsors.length === 0 ? (
                  <p className="text-xs text-white/40 italic p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                    No sponsors yet. Add sponsors in the Sponsors tab first, then edit this award to attach them.
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
        </GlassCard>
      )}

      {/* List */}
      {loading ? (
        <GlassCard>
          <div className="py-8 text-center text-sm text-white/40">Loading awards...</div>
        </GlassCard>
      ) : awards.length === 0 ? (
        <GlassCard>
          <div className="py-8 text-center">
            <p className="text-sm text-white/50">No awards yet.</p>
            <p className="text-xs text-white/30 mt-1">Create one above to have it appear on the Rules page.</p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {awards.map((award) => (
            <GlassCard key={award.id} className="!p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-white truncate">{award.name}</h3>
                    {!award.is_active && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded text-white/50" style={{ background: "rgba(255,255,255,0.08)" }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  {award.prize && (
                    <p className="text-xs font-semibold text-maize mb-1">{award.prize}</p>
                  )}
                  {award.description && (
                    <p className="text-xs text-white/60 leading-relaxed line-clamp-2">{award.description}</p>
                  )}
                </div>
              </div>

              {/* Sponsors */}
              {award.sponsors?.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Sponsored by</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {award.sponsors.map((s) => (
                      <div
                        key={s.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-white/70"
                        style={{ background: "rgba(255,255,255,0.04)" }}
                      >
                        {s.logo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.logo_url} alt="" className="w-4 h-4 object-contain" />
                        )}
                        {s.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => startEdit(award)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(award)}
                  disabled={deletingId === award.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  {deletingId === award.id ? "..." : "Delete"}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

    </div>
  );
}
