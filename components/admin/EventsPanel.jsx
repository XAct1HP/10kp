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

// ISO ↔ datetime-local string helpers. datetime-local expects
// "YYYY-MM-DDTHH:mm" in local time and gives it back the same way.
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local) {
  if (!local) return null;
  const d = new Date(local);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function mapEmbedSrc(address) {
  if (!address) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

function formatEventTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const EMPTY_FORM = {
  title: "",
  content: "",
  event_starts_at: "",
  event_ends_at: "",
  event_location_name: "",
  event_address: "",
  event_registration_url: "",
  is_published: true,
  sponsor_ids: [],
};

/**
 * EventsPanel — CRUD for event-type announcements.
 *
 * Each event is a self-contained announcement row with event_* fields.
 * Sponsors attach via announcement_sponsors (independent of the Awards
 * sponsor list).
 *
 * Props:
 *   apiFetch: (url, opts?) => Promise
 *   onError, onSuccess: (msg) => void
 */
export default function EventsPanel({ apiFetch, onError, onSuccess }) {
  const [events, setEvents] = useState([]);
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ann, spons] = await Promise.all([
        apiFetch("/api/admin/announcements"),
        apiFetch("/api/admin/sponsors"),
      ]);
      setEvents((ann || []).filter((a) => a.announcement_type === "event"));
      setSponsors(spons || []);
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
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (ev) => {
    setEditing(ev);
    setForm({
      title: ev.title || "",
      content: ev.content || "",
      event_starts_at: isoToLocalInput(ev.event_starts_at),
      event_ends_at: isoToLocalInput(ev.event_ends_at),
      event_location_name: ev.event_location_name || "",
      event_address: ev.event_address || "",
      event_registration_url: ev.event_registration_url || "",
      is_published: ev.is_published !== false,
      sponsor_ids: (ev.sponsors || []).map((s) => s.id),
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
    if (!form.title.trim() || !form.content.trim() || !form.event_starts_at || !form.event_address.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        announcement_type: "event",
        is_published: !!form.is_published,
        event_starts_at: localInputToIso(form.event_starts_at),
        event_ends_at: form.event_ends_at ? localInputToIso(form.event_ends_at) : null,
        event_location_name: form.event_location_name.trim() || null,
        event_address: form.event_address.trim(),
        event_registration_url: form.event_registration_url.trim() || null,
        sponsor_ids: form.sponsor_ids,
      };
      if (editing) {
        await apiFetch("/api/admin/announcements", {
          method: "PUT",
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
        onSuccess?.("Event updated");
      } else {
        await apiFetch("/api/admin/announcements", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onSuccess?.("Event published");
      }
      resetForm();
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ev) => {
    if (!confirm(`Delete event "${ev.title}"?`)) return;
    setDeletingId(ev.id);
    try {
      await apiFetch(`/api/admin/announcements?id=${ev.id}`, { method: "DELETE" });
      onSuccess?.("Event deleted");
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const canSubmit =
    !submitting &&
    form.title.trim() &&
    form.content.trim() &&
    form.event_starts_at &&
    form.event_address.trim();

  const mapPreview = mapEmbedSrc(form.event_address.trim());

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto no-scrollbar pr-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">Events</h2>
          <p className="text-xs text-white/40 mt-0.5">
            Workshops, info sessions, and other events that promote the competition.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
            style={{ background: "#FFCB05" }}
          >
            + Add Event
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-white">
                {editing ? "Edit event" : "New event"}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Left column — event details */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Event title</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    placeholder="Pitch Workshop with the Zell Lurie Institute"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Description</label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    required
                    rows={4}
                    placeholder="Join us for a hands-on workshop where..."
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize resize-none"
                    style={inputStyle}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Starts</label>
                    <input
                      type="datetime-local"
                      value={form.event_starts_at}
                      onChange={(e) => setForm({ ...form, event_starts_at: e.target.value })}
                      required
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white focus:outline-none focus:border-maize"
                      style={{ ...inputStyle, colorScheme: "dark" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Ends (optional)</label>
                    <input
                      type="datetime-local"
                      value={form.event_ends_at}
                      onChange={(e) => setForm({ ...form, event_ends_at: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white focus:outline-none focus:border-maize"
                      style={{ ...inputStyle, colorScheme: "dark" }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Location name (optional)</label>
                  <input
                    value={form.event_location_name}
                    onChange={(e) => setForm({ ...form, event_location_name: e.target.value })}
                    placeholder="Ross School of Business, Room 1234"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Address (for the map)</label>
                  <input
                    value={form.event_address}
                    onChange={(e) => setForm({ ...form, event_address: e.target.value })}
                    required
                    placeholder="701 Tappan Ave, Ann Arbor, MI 48109"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Registration URL (optional)</label>
                  <input
                    type="url"
                    value={form.event_registration_url}
                    onChange={(e) => setForm({ ...form, event_registration_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    className="w-4 h-4 accent-maize"
                  />
                  Published (show on Announcements page)
                </label>
              </div>

              {/* Right column — map preview + sponsors */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Map preview</label>
                  <div
                    className="w-full aspect-video rounded-lg overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {mapPreview ? (
                      <iframe
                        title="Event map preview"
                        src={mapPreview}
                        className="w-full h-full"
                        style={{ border: 0 }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-xs text-white/30">Enter an address to preview</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-2">
                    Sponsors ({form.sponsor_ids.length} selected)
                  </label>
                  {sponsors.length === 0 ? (
                    <p className="text-xs text-white/40 italic p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                      No sponsors yet. Add sponsors in the Sponsors tab, then edit this event to attach them.
                    </p>
                  ) : (
                    <div className="space-y-2">
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
                disabled={!canSubmit}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                style={{ background: "#FFCB05" }}
              >
                {submitting ? "Saving..." : editing ? "Save changes" : "Publish event"}
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* List */}
      {loading ? (
        <GlassCard>
          <div className="py-8 text-center text-sm text-white/40">Loading events...</div>
        </GlassCard>
      ) : events.length === 0 ? (
        <GlassCard>
          <div className="py-8 text-center">
            <p className="text-sm text-white/50">No events yet.</p>
            <p className="text-xs text-white/30 mt-1">Add one above to have it appear on the Announcements page.</p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {events.map((ev) => (
            <GlassCard key={ev.id} className="!p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-white truncate">{ev.title}</h3>
                    {!ev.is_published && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded text-white/50" style={{ background: "rgba(255,255,255,0.08)" }}>
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-maize font-medium">{formatEventTime(ev.event_starts_at)}</p>
                  {ev.event_location_name && (
                    <p className="text-xs text-white/60 mt-0.5">{ev.event_location_name}</p>
                  )}
                  {ev.event_address && (
                    <p className="text-[11px] text-white/40 mt-0.5">{ev.event_address}</p>
                  )}
                </div>
              </div>

              {ev.content && (
                <p className="text-xs text-white/65 leading-relaxed line-clamp-3 mt-2">{ev.content}</p>
              )}

              {ev.sponsors?.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Sponsored by</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {ev.sponsors.map((s) => (
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
                  onClick={() => startEdit(ev)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(ev)}
                  disabled={deletingId === ev.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  {deletingId === ev.id ? "..." : "Delete"}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
