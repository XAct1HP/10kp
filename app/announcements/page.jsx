"use client";

import { useEffect, useMemo, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import PageBackground from "../../components/PageBackground";
// The blue cork board background image the user is providing.
// Drop the file at /public/bulletin_bg.png and it'll load automatically.
import bulletinBg from "../../public/bulletin_bg.png";

// ─── Push pin (SVG) ─────────────────────────────────────────────
// Simple top-down thumbtack. Wrapped in a fixed-size container so it
// sits neatly above each note.
function PushPin({ color = "#FFCB05", size = 32 }) {
  // A tiny ID suffix per color keeps <defs> unique when multiple pins
  // render on the page.
  const id = color.replace("#", "");
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.35))" }}
    >
      <defs>
        <radialGradient id={`pin-grad-${id}`} cx="34%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="35%" stopColor={color} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
        </radialGradient>
      </defs>
      {/* Faint shadow ellipse under the pin */}
      <ellipse cx="20" cy="34" rx="9" ry="1.6" fill="rgba(0,0,0,0.28)" />
      {/* Pin body */}
      <circle cx="20" cy="18" r="13" fill={`url(#pin-grad-${id})`} />
      {/* Highlight */}
      <ellipse cx="15" cy="12" rx="4" ry="2.2" fill="rgba(255,255,255,0.65)" />
    </svg>
  );
}

// ─── Note wrapper (paper card) ──────────────────────────────────
// Applies subtle rotation and paper styling. Different colors per type.
const NOTE_STYLES = {
  award: {
    paper: "#FFF4C4",   // pale maize
    pin: "#FFCB05",
    accent: "#8A6E00",
  },
  event: {
    paper: "#DCEBFF",   // pale blue
    pin: "#3B82F6",
    accent: "#1E3A8A",
  },
  general: {
    paper: "#FEFCF3",   // cream
    pin: "#F5F5F5",
    accent: "#334155",
  },
};

function Note({ type = "general", children, rotate = 0, className = "" }) {
  const style = NOTE_STYLES[type] || NOTE_STYLES.general;
  return (
    <div
      className={`relative rounded-sm ${className}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        transformOrigin: "top center",
        transition: "transform 0.2s ease",
      }}
    >
      {/* Pin (sits on top center) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -top-3 z-10"
      >
        <PushPin color={style.pin} />
      </div>

      {/* Paper */}
      <div
        className="px-5 pt-8 pb-5"
        style={{
          background: style.paper,
          borderRadius: "3px",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.15), 0 6px 20px rgba(0,0,0,0.25), inset 0 0 40px rgba(0,0,0,0.03)",
          color: "#1a1a1a",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Sponsor row (dark text for paper backgrounds) ─────────────
function SponsorRow({ sponsors }) {
  if (!sponsors?.length) return null;
  return (
    <div className="pt-3 mt-3" style={{ borderTop: "1px dashed rgba(0,0,0,0.15)" }}>
      <p className="text-[9px] uppercase tracking-[0.22em] font-bold mb-2" style={{ color: "#666" }}>
        Sponsored by
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {sponsors.map((s) => {
          const inner = (
            <div
              className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded"
              style={{ background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)" }}
            >
              {s.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo_url} alt={s.name} className="w-4 h-4 object-contain" />
              ) : (
                <span
                  className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: "#0B1A3B" }}
                >
                  {s.name.charAt(0)}
                </span>
              )}
              <span className="text-[10px] font-medium" style={{ color: "#333" }}>{s.name}</span>
            </div>
          );
          return s.website ? (
            <a key={s.id} href={s.website} target="_blank" rel="noopener noreferrer" className="inline-block transition-transform hover:-translate-y-0.5">
              {inner}
            </a>
          ) : (
            <div key={s.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pitch helpers ──────────────────────────────────────────────
function getPitchType(pitch) {
  if (!pitch) return "unknown";
  if (pitch.file_type === "video" || pitch.mux_playback_id) return "video";
  if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(pitch.file_name || "")) return "audio";
  return "text";
}
function getPitchThumbnail(pitch) {
  if (!pitch) return null;
  if (pitch.thumbnail_path) return pitch.thumbnail_path;
  if (pitch.mux_playback_id) {
    return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1&width=480&fit_mode=smartcrop`;
  }
  return null;
}

// Polaroid-style winner card that sits on a note.
function WinnerPolaroid({ pitch, onOpen }) {
  const thumb = getPitchThumbnail(pitch);
  return (
    <button
      type="button"
      onClick={() => onOpen(pitch)}
      className="text-left transition-transform hover:-translate-y-0.5 active:translate-y-0"
      style={{
        background: "#fff",
        padding: "6px 6px 10px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      }}
    >
      <div className="aspect-video w-full overflow-hidden flex items-center justify-center" style={{ background: "#eee" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={pitch.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">{getPitchType(pitch)}</span>
        )}
      </div>
      <p className="mt-2 text-[11px] font-bold truncate" style={{ color: "#1a1a1a" }}>{pitch.name}</p>
      <p className="text-[10px] truncate italic" style={{ color: "#555" }}>{pitch.title}</p>
    </button>
  );
}

// ─── Cards ──────────────────────────────────────────────────────
function GeneralNote({ announcement, rotate }) {
  return (
    <Note type="general" rotate={rotate}>
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2" style={{ color: "#666" }}>
        📢 Announcement
      </p>
      <h3 className="text-base font-bold" style={{ color: "#1a1a1a" }}>{announcement.title}</h3>
      <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: "#333" }}>
        {announcement.content}
      </p>
      <p className="text-[9px] mt-3 text-right italic" style={{ color: "#888" }}>
        {new Date(announcement.updated_at || announcement.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
      </p>
    </Note>
  );
}

function AwardNote({ announcement, rotate, onOpenPitch }) {
  const { award } = announcement;
  return (
    <Note type="award" rotate={rotate}>
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2" style={{ color: "#8A6E00" }}>
        🏆 {award?.name ? `${award.name} — Winners` : "Winners"}
      </p>
      <h3 className="text-base font-bold" style={{ color: "#1a1a1a" }}>{announcement.title}</h3>
      {award?.prize && (
        <p className="text-xs font-semibold mt-1" style={{ color: "#8A6E00" }}>{award.prize}</p>
      )}
      {announcement.content && (
        <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: "#333" }}>
          {announcement.content}
        </p>
      )}
      {announcement.winners?.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {announcement.winners.map((w) => (
            <WinnerPolaroid key={w.id} pitch={w} onOpen={onOpenPitch} />
          ))}
        </div>
      )}
      <SponsorRow sponsors={award?.sponsors} />
      <p className="text-[9px] mt-3 text-right italic" style={{ color: "#888" }}>
        {new Date(announcement.updated_at || announcement.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
      </p>
    </Note>
  );
}

function formatEventDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatEventTimeRange(startIso, endIso) {
  if (!startIso) return "";
  const start = new Date(startIso);
  const startStr = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!endIso) return startStr;
  const end = new Date(endIso);
  const endStr = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${startStr} – ${endStr}`;
}

function EventNote({ announcement, rotate }) {
  const mapSrc = announcement.event_address
    ? `https://www.google.com/maps?q=${encodeURIComponent(announcement.event_address)}&output=embed`
    : null;
  const directionsUrl = announcement.event_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(announcement.event_address)}`
    : null;

  return (
    <Note type="event" rotate={rotate}>
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2" style={{ color: "#1E3A8A" }}>
        📅 Upcoming Event
      </p>
      <h3 className="text-base font-bold" style={{ color: "#1a1a1a" }}>{announcement.title}</h3>
      <p className="text-xs font-semibold mt-1" style={{ color: "#1E3A8A" }}>
        {formatEventDate(announcement.event_starts_at)} · {formatEventTimeRange(announcement.event_starts_at, announcement.event_ends_at)}
      </p>
      {(announcement.event_location_name || announcement.event_address) && (
        <p className="text-xs mt-1" style={{ color: "#444" }}>
          📍 {announcement.event_location_name || announcement.event_address}
          {announcement.event_location_name && announcement.event_address && (
            <span style={{ color: "#777" }}> · {announcement.event_address}</span>
          )}
        </p>
      )}
      {announcement.content && (
        <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: "#333" }}>
          {announcement.content}
        </p>
      )}
      {mapSrc && (
        <div
          className="w-full aspect-video overflow-hidden mt-3"
          style={{ background: "#eee", border: "1px solid rgba(0,0,0,0.08)" }}
        >
          <iframe
            title={`Map: ${announcement.title}`}
            src={mapSrc}
            className="w-full h-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {announcement.event_registration_url && (
          <a
            href={announcement.event_registration_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: "#FFCB05", color: "#1a1a1a" }}
          >
            Register →
          </a>
        )}
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: "rgba(0,0,0,0.08)", color: "#333", border: "1px solid rgba(0,0,0,0.15)" }}
          >
            Directions
          </a>
        )}
      </div>
      <SponsorRow sponsors={announcement.sponsors} />
    </Note>
  );
}

// ─── Column header (like a bulletin banner) ─────────────────────
function ColumnHeader({ title, subtitle }) {
  return (
    <div className="mb-3 text-center">
      <div
        className="inline-block px-5 py-2 rounded"
        style={{
          background: "rgba(11,26,59,0.85)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
        }}
      >
        <p className="text-xs uppercase tracking-[0.28em] font-bold" style={{ color: "#FFCB05" }}>{title}</p>
      </div>
      {subtitle && <p className="text-[10px] text-white/50 mt-1.5">{subtitle}</p>}
    </div>
  );
}

// Alternate small rotations for visual variety.
function noteRotate(index) {
  const angles = [-1.5, 1, -0.5, 1.75, -1, 0.5, -1.25, 1.5];
  return angles[index % angles.length];
}

// ─── Page ────────────────────────────────────────────────────────
export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPitch, setSelectedPitch] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [extractingText, setExtractingText] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/announcements", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load announcements.");
        if (!cancelled) setAnnouncements(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load announcements.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Column 1: general + award announcements, newest first.
  const leftColumn = useMemo(() => {
    return announcements
      .filter((a) => a.announcement_type === "award" || (a.announcement_type || "general") === "general")
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
      );
  }, [announcements]);

  // Column 2: upcoming events only (event_starts_at > now), soonest first.
  const rightColumn = useMemo(() => {
    const now = Date.now();
    return announcements
      .filter(
        (a) =>
          a.announcement_type === "event" &&
          a.event_starts_at &&
          new Date(a.event_starts_at).getTime() > now
      )
      .slice()
      .sort((a, b) => new Date(a.event_starts_at) - new Date(b.event_starts_at));
  }, [announcements]);

  // Pitch modal — text extraction for text-type pitches.
  useEffect(() => {
    setExtractedText("");
    setExtractingText(false);
    if (!selectedPitch?.file_path) return;
    if (!/\.(pdf|doc|docx|txt)$/i.test(selectedPitch.file_name || "")) return;

    let cancelled = false;
    setExtractingText(true);
    fetch(
      `/api/gallery/extract-text?path=${encodeURIComponent(selectedPitch.file_path)}&name=${encodeURIComponent(selectedPitch.file_name || "")}`
    )
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data?.text) setExtractedText(data.text); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setExtractingText(false); });
    return () => { cancelled = true; };
  }, [selectedPitch?.id, selectedPitch?.file_path, selectedPitch?.file_name]);

  return (
    <div className="relative h-[calc(100vh-5rem)] overflow-hidden">
      {/* Fixed cork board background */}
      <PageBackground src={bulletinBg} priority quality={72} fixed />
      {/* Very subtle darken overlay so the bright header banners stay legible */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0, background: "rgba(6,14,33,0.15)" }}
      />

      {/* Two-column bulletin */}
      <div className="relative z-10 h-full flex flex-col">
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 sm:px-6 lg:px-10 py-6">
          {/* LEFT — general + awards */}
          <section className="flex flex-col min-h-0">
            <ColumnHeader title="Announcements & Winners" subtitle="News, reminders, and award announcements" />
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
              <div className="space-y-8 pt-4 pb-8 px-3 sm:px-6 max-w-xl mx-auto">
                {loading ? (
                  <p className="text-white/60 text-sm text-center py-10">Loading the board...</p>
                ) : error ? (
                  <p className="text-red-300 text-sm text-center py-10">{error}</p>
                ) : leftColumn.length === 0 ? (
                  <Note type="general" rotate={-1}>
                    <p className="text-sm" style={{ color: "#555" }}>No announcements posted yet.</p>
                  </Note>
                ) : (
                  leftColumn.map((a, i) => {
                    const t = a.announcement_type === "award" ? "award" : "general";
                    const rot = noteRotate(i);
                    return t === "award" ? (
                      <AwardNote key={a.id} announcement={a} rotate={rot} onOpenPitch={setSelectedPitch} />
                    ) : (
                      <GeneralNote key={a.id} announcement={a} rotate={rot} />
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* RIGHT — upcoming events */}
          <section className="flex flex-col min-h-0">
            <ColumnHeader title="Upcoming Events" subtitle="Workshops and events — vanish once they start" />
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
              <div className="space-y-8 pt-4 pb-8 px-3 sm:px-6 max-w-xl mx-auto">
                {loading ? (
                  <p className="text-white/60 text-sm text-center py-10">Loading events...</p>
                ) : rightColumn.length === 0 ? (
                  <Note type="event" rotate={1}>
                    <p className="text-sm" style={{ color: "#555" }}>No upcoming events. Check back soon!</p>
                  </Note>
                ) : (
                  rightColumn.map((a, i) => (
                    <EventNote key={a.id} announcement={a} rotate={noteRotate(i + 3)} />
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Pitch preview modal (for tapping winner polaroids) */}
      {selectedPitch && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setSelectedPitch(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] sm:max-h-[90vh] overflow-auto no-scrollbar rounded-2xl border border-white/10 p-4"
            style={{ background: "rgba(11,26,59,0.96)", backdropFilter: "blur(24px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedPitch.title}</h3>
                <p className="text-xs text-white/40 mt-1">
                  By {selectedPitch.name}
                  {selectedPitch.role ? ` • ${selectedPitch.role}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPitch(null)}
                className="text-white/40 hover:text-white text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {getPitchType(selectedPitch) === "video" && selectedPitch.mux_playback_id && (
              <MuxPlayer
                playbackId={selectedPitch.mux_playback_id}
                accentColor="#FFCB05"
                style={{ width: "100%", borderRadius: "0.75rem", overflow: "hidden" }}
              />
            )}

            {getPitchType(selectedPitch) === "audio" && selectedPitch.file_path && (
              <div className="space-y-3">
                {getPitchThumbnail(selectedPitch) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getPitchThumbnail(selectedPitch)}
                    alt=""
                    className="w-full max-w-md aspect-video rounded-xl object-cover border border-white/10"
                  />
                )}
                <audio controls className="w-full">
                  <source src={`/api/gallery/stream-audio?path=${encodeURIComponent(selectedPitch.file_path)}`} />
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {getPitchType(selectedPitch) === "text" && (
              <div className="space-y-3">
                {getPitchThumbnail(selectedPitch) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getPitchThumbnail(selectedPitch)}
                    alt=""
                    className="w-full max-w-md aspect-video rounded-xl object-cover border border-white/10"
                  />
                )}
                <div
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75 whitespace-pre-wrap leading-relaxed"
                  style={{ maxHeight: "45vh", overflowY: "auto" }}
                >
                  {extractingText
                    ? "Loading full text..."
                    : extractedText ||
                      selectedPitch.text_content ||
                      selectedPitch.description ||
                      "No text content available."}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
