"use client";

import { useEffect, useMemo, useState } from "react";
import RecordWinnersModal from "./RecordWinnersModal";

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

// ─── datetime helpers ────────────────────────────────────────────
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
  return address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed` : null;
}
function formatEventTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// ─── Type badge ─────────────────────────────────────────────────
function TypeBadge({ type }) {
  const style =
    type === "award"
      ? { bg: "rgba(255,203,5,0.12)", color: "#FFCB05", label: "Award" }
      : type === "event"
      ? { bg: "rgba(59,130,246,0.12)", color: "#93c5fd", label: "Event" }
      : { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", label: "General" };
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
}

// ─── Event form (inline) ────────────────────────────────────────
const EMPTY_EVENT = {
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

function EventForm({ apiFetch, sponsors, editing, onError, onSuccess, onDone }) {
  const [form, setForm] = useState(EMPTY_EVENT);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        title: editing.title || "",
        content: editing.content || "",
        event_starts_at: isoToLocalInput(editing.event_starts_at),
        event_ends_at: isoToLocalInput(editing.event_ends_at),
        event_location_name: editing.event_location_name || "",
        event_address: editing.event_address || "",
        event_registration_url: editing.event_registration_url || "",
        is_published: editing.is_published !== false,
        sponsor_ids: (editing.sponsors || []).map((s) => s.id),
      });
    } else {
      setForm(EMPTY_EVENT);
    }
  }, [editing]);

  const sponsorsById = useMemo(() => {
    const m = new Map();
    sponsors.forEach((s) => m.set(s.id, s));
    return m;
  }, [sponsors]);

  const toggleSponsor = (id) =>
    setForm((f) => ({
      ...f,
      sponsor_ids: f.sponsor_ids.includes(id)
        ? f.sponsor_ids.filter((x) => x !== id)
        : [...f.sponsor_ids, id],
    }));

  const moveSponsor = (id, dir) =>
    setForm((f) => {
      const list = [...f.sponsor_ids];
      const idx = list.indexOf(id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= list.length) return f;
      [list[idx], list[target]] = [list[target], list[idx]];
      return { ...f, sponsor_ids: list };
    });

  const canSubmit =
    !submitting &&
    form.title.trim() &&
    form.content.trim() &&
    form.event_starts_at &&
    form.event_address.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
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
      setForm(EMPTY_EVENT);
      onDone?.();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const mapPreview = mapEmbedSrc(form.event_address.trim());

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
          Published
        </label>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Map preview</label>
          <div
            className="w-full aspect-video rounded-lg overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {mapPreview ? (
              <iframe title="Map preview" src={mapPreview} className="w-full h-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
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
              No sponsors yet. Add sponsors in Settings, then edit this event.
            </p>
          ) : (
            <div className="space-y-2">
              {form.sponsor_ids.length > 0 && (
                <div className="space-y-1.5">
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
                        {s.logo_url && <img src={s.logo_url} alt="" className="w-6 h-6 object-contain" /> /* eslint-disable-line @next/next/no-img-element */ }
                        <span className="flex-1 text-sm text-white">{s.name}</span>
                        <button type="button" onClick={() => moveSponsor(id, -1)} disabled={idx === 0} className="text-xs text-white/50 hover:text-white disabled:opacity-20 px-1.5" aria-label="Move up">↑</button>
                        <button type="button" onClick={() => moveSponsor(id, 1)} disabled={idx === form.sponsor_ids.length - 1} className="text-xs text-white/50 hover:text-white disabled:opacity-20 px-1.5" aria-label="Move down">↓</button>
                        <button type="button" onClick={() => toggleSponsor(id)} className="text-xs text-red-300 hover:text-red-200 px-1.5" aria-label="Remove">✕</button>
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
                      {s.logo_url && <img src={s.logo_url} alt="" className="w-4 h-4 object-contain" /> /* eslint-disable-line @next/next/no-img-element */ }
                      + {s.name}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 flex justify-end gap-2 pt-1">
        {editing && (
          <button
            type="button"
            onClick={() => { setForm(EMPTY_EVENT); onDone?.(); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white transition-colors"
          >
            Cancel edit
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{ background: "#FFCB05" }}
        >
          {submitting ? "Saving..." : editing ? "Save event" : "Publish event"}
        </button>
      </div>
    </form>
  );
}

// ─── General form (inline) ──────────────────────────────────────
function GeneralForm({ apiFetch, editing, onError, onSuccess, onDone }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title || "");
      setContent(editing.content || "");
      setIsPublished(editing.is_published !== false);
    } else {
      setTitle(""); setContent(""); setIsPublished(true);
    }
  }, [editing]);

  const canSubmit = !submitting && title.trim() && content.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        is_published: isPublished,
        announcement_type: "general",
      };
      if (editing) {
        await apiFetch("/api/admin/announcements", {
          method: "PUT",
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
        onSuccess?.("Announcement updated");
      } else {
        await apiFetch("/api/admin/announcements", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onSuccess?.("Announcement posted");
      }
      setTitle(""); setContent(""); setIsPublished(true);
      onDone?.();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Weekly reminder — submissions still open!"
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Message</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={6}
          placeholder="Write your announcement..."
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize resize-none"
          style={inputStyle}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="w-4 h-4 accent-maize" />
        Published
      </label>
      <div className="flex justify-end gap-2 pt-1">
        {editing && (
          <button type="button" onClick={() => onDone?.()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white transition-colors">
            Cancel edit
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{ background: "#FFCB05" }}
        >
          {submitting ? "Saving..." : editing ? "Save changes" : "Post announcement"}
        </button>
      </div>
    </form>
  );
}

// ─── Panel ──────────────────────────────────────────────────────
export default function AnnouncementsAdminPanel({ apiFetch, onError, onSuccess }) {
  const [mode, setMode] = useState("general"); // general | award | event
  const [announcements, setAnnouncements] = useState([]);
  const [awards, setAwards] = useState([]);
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [recordingFor, setRecordingFor] = useState(null); // award being announced
  const [listFilter, setListFilter] = useState("all"); // all | general | award | event

  const load = async () => {
    setLoading(true);
    try {
      const [ann, aws, spons] = await Promise.all([
        apiFetch("/api/admin/announcements"),
        apiFetch("/api/admin/awards"),
        apiFetch("/api/admin/sponsors"),
      ]);
      setAnnouncements(ann || []);
      setAwards((aws || []).filter((a) => a.is_active !== false));
      setSponsors(spons || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filteredAnnouncements = useMemo(() => {
    if (listFilter === "all") return announcements;
    return announcements.filter((a) => (a.announcement_type || "general") === listFilter);
  }, [announcements, listFilter]);

  const handleDelete = async (a) => {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    setDeletingId(a.id);
    try {
      await apiFetch(`/api/admin/announcements?id=${a.id}`, { method: "DELETE" });
      onSuccess?.("Announcement deleted");
      if (editing?.id === a.id) setEditing(null);
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (a) => {
    const t = a.announcement_type || "general";
    if (t === "award") {
      onError?.("Award announcements can't be edited directly — delete and re-announce winners instead.");
      return;
    }
    setEditing(a);
    setMode(t);
  };

  const modes = [
    { id: "general", label: "General", desc: "Reminders and competition updates" },
    { id: "award", label: "Award Winners", desc: "Announce winners of an existing award" },
    { id: "event", label: "Event", desc: "Workshops, info sessions, etc." },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto no-scrollbar pr-1">
      {/* Header + segmented mode picker */}
      <GlassCard>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Post Announcement</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Pick a type below. Each announcement type has its own format on the public page.
            </p>
          </div>
          <div
            className="inline-flex p-1 rounded-xl w-full sm:w-auto"
            style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {modes.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMode(m.id); setEditing(null); }}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    active ? "text-black" : "text-white/50 hover:text-white/80"
                  }`}
                  style={active ? { background: "#FFCB05" } : {}}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </GlassCard>

      {/* Mode-specific form */}
      <GlassCard>
        {mode === "general" && (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">{editing ? "Edit general announcement" : "New general announcement"}</h3>
                <p className="text-xs text-white/40 mt-0.5">Freeform title and message. Use this for reminders and general updates.</p>
              </div>
            </div>
            <GeneralForm
              apiFetch={apiFetch}
              editing={editing?.announcement_type === "general" ? editing : null}
              onError={onError}
              onSuccess={onSuccess}
              onDone={async () => { setEditing(null); await load(); }}
            />
          </>
        )}

        {mode === "award" && (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Announce winners of an award</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Pick an award below to open the winner picker. Each announcement is a fresh batch — previous winners of the same award are not included.
                </p>
              </div>
            </div>
            {awards.length === 0 ? (
              <p className="text-sm text-white/40 italic p-4 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                No awards defined yet. Create awards in Settings → Awards first.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {awards.map((award) => (
                  <button
                    key={award.id}
                    type="button"
                    onClick={() => setRecordingFor(award)}
                    className="text-left p-4 rounded-xl transition-transform hover:-translate-y-0.5"
                    style={{ background: "rgba(255,203,5,0.05)", border: "1px solid rgba(255,203,5,0.2)" }}
                  >
                    <p className="text-sm font-bold text-white">{award.name}</p>
                    {award.prize && <p className="text-xs font-semibold text-maize mt-1">{award.prize}</p>}
                    {award.description && (
                      <p className="text-xs text-white/60 mt-1 line-clamp-2">{award.description}</p>
                    )}
                    {award.sponsors?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {award.sponsors.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/60"
                            style={{ background: "rgba(255,255,255,0.05)" }}
                          >
                            {s.logo_url && <img src={s.logo_url} alt="" className="w-3.5 h-3.5 object-contain" /> /* eslint-disable-line @next/next/no-img-element */ }
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-[11px] font-semibold text-black inline-block px-2 py-1 rounded" style={{ background: "#FFCB05" }}>
                      Announce winners →
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {mode === "event" && (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">{editing ? "Edit event announcement" : "New event announcement"}</h3>
                <p className="text-xs text-white/40 mt-0.5">Workshops, info sessions, and other events. Includes an interactive map.</p>
              </div>
            </div>
            <EventForm
              apiFetch={apiFetch}
              sponsors={sponsors}
              editing={editing?.announcement_type === "event" ? editing : null}
              onError={onError}
              onSuccess={onSuccess}
              onDone={async () => { setEditing(null); await load(); }}
            />
          </>
        )}
      </GlassCard>

      {/* All announcements list */}
      <GlassCard className="!p-0">
        <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div>
            <h3 className="text-sm font-bold text-white">Posted announcements</h3>
            <p className="text-[11px] text-white/40">{filteredAnnouncements.length} total</p>
          </div>
          <div className="inline-flex p-0.5 rounded-lg" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {[{ id: "all", label: "All" }, { id: "general", label: "General" }, { id: "award", label: "Awards" }, { id: "event", label: "Events" }].map((f) => {
              const active = listFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setListFilter(f.id)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${active ? "text-black" : "text-white/50 hover:text-white/80"}`}
                  style={active ? { background: "#FFCB05" } : {}}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <p className="text-white/40 text-sm p-5">Loading...</p>
        ) : filteredAnnouncements.length === 0 ? (
          <p className="text-white/40 text-sm p-5">No announcements yet.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {filteredAnnouncements.map((a) => {
              const t = a.announcement_type || "general";
              return (
                <div key={a.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TypeBadge type={t} />
                        <h4 className="text-sm font-semibold text-white truncate">{a.title}</h4>
                        {a.is_published === false && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded text-white/50" style={{ background: "rgba(255,255,255,0.08)" }}>
                            Draft
                          </span>
                        )}
                      </div>
                      {a.content && (
                        <p className="text-xs text-white/55 mt-1 line-clamp-2 whitespace-pre-wrap">{a.content}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
                        <span>Updated {new Date(a.updated_at || a.created_at).toLocaleString()}</span>
                        {t === "event" && a.event_starts_at && (
                          <span className="text-blue-300/70">📅 {formatEventTime(a.event_starts_at)}</span>
                        )}
                        {t === "award" && a.award?.name && (
                          <span className="text-maize/70">🏆 {a.award.name} · {a.winners?.length || 0} winner{a.winners?.length === 1 ? "" : "s"}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {t !== "award" && (
                        <button
                          onClick={() => handleEdit(a)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors"
                          style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(a)}
                        disabled={deletingId === a.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
                        style={{ border: "1px solid rgba(239,68,68,0.25)" }}
                      >
                        {deletingId === a.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {recordingFor && (
        <RecordWinnersModal
          award={recordingFor}
          apiFetch={apiFetch}
          onClose={() => setRecordingFor(null)}
          onError={onError}
          onSuccess={onSuccess}
          onCreated={async () => { await load(); }}
        />
      )}
    </div>
  );
}
