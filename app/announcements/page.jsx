"use client";

import { useEffect, useMemo, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import Link from "next/link";
import PageBackground from "../../components/PageBackground";
import adminBg from "../../public/admin_bg.png";

// ─── Shared UI ────────────────────────────────────────────────────
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
    return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1&width=640&fit_mode=smartcrop`;
  }
  return null;
}

function SponsorRow({ sponsors }) {
  if (!sponsors?.length) return null;
  return (
    <div className="pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 mb-2">
        Sponsored by
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {sponsors.map((s) => {
          const inner = (
            <div
              className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {s.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo_url} alt={s.name} className="w-5 h-5 object-contain" />
              ) : (
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-black"
                  style={{ background: "#FFCB05" }}
                >
                  {s.name.charAt(0)}
                </span>
              )}
              <span className="text-[11px] font-medium text-white/85">{s.name}</span>
            </div>
          );
          return s.website ? (
            <a
              key={s.id}
              href={s.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block transition-transform hover:-translate-y-0.5"
            >
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

function WinnerCard({ pitch, onOpen }) {
  const thumb = getPitchThumbnail(pitch);
  return (
    <button
      type="button"
      onClick={() => onOpen(pitch)}
      className="text-left rounded-xl overflow-hidden transition-transform hover:-translate-y-0.5 group"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="aspect-video w-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={pitch.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-white/40 uppercase tracking-wider">{getPitchType(pitch)}</span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-white truncate group-hover:text-maize transition-colors">
          {pitch.title}
        </p>
        <p className="text-xs text-white/55 truncate mt-0.5">
          {pitch.name}
          {pitch.role ? ` • ${pitch.role}` : ""}
        </p>
      </div>
    </button>
  );
}

function AwardAnnouncementCard({ announcement, onOpenPitch }) {
  const { award } = announcement;
  return (
    <article
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,203,5,0.05)",
        border: "1px solid rgba(255,203,5,0.2)",
      }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2 flex-wrap"
        style={{ background: "rgba(255,203,5,0.1)", borderBottom: "1px solid rgba(255,203,5,0.15)" }}
      >
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ color: "#FFCB05" }}>
          🏆 Winners
        </span>
        {award?.name && (
          <span className="text-xs font-semibold text-white/85">{award.name}</span>
        )}
        {award?.prize && (
          <span className="text-[11px] text-white/55">• {award.prize}</span>
        )}
      </div>
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">{announcement.title}</h3>
          {announcement.content && (
            <p className="text-sm text-white/75 whitespace-pre-wrap mt-1.5 leading-relaxed">
              {announcement.content}
            </p>
          )}
        </div>
        {announcement.winners?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {announcement.winners.map((w) => (
              <WinnerCard key={w.id} pitch={w} onOpen={onOpenPitch} />
            ))}
          </div>
        )}
        <SponsorRow sponsors={award?.sponsors} />
      </div>
    </article>
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

function EventAnnouncementCard({ announcement }) {
  const mapSrc = announcement.event_address
    ? `https://www.google.com/maps?q=${encodeURIComponent(announcement.event_address)}&output=embed`
    : null;
  const directionsUrl = announcement.event_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(announcement.event_address)}`
    : null;
  const startsAt = announcement.event_starts_at;
  const isPast = startsAt && new Date(startsAt).getTime() < Date.now() - 60 * 60 * 1000;

  return (
    <article
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(59,130,246,0.05)",
        border: "1px solid rgba(59,130,246,0.2)",
      }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2 flex-wrap"
        style={{ background: "rgba(59,130,246,0.1)", borderBottom: "1px solid rgba(59,130,246,0.15)" }}
      >
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-blue-300">
          📅 Event
        </span>
        {startsAt && (
          <span className="text-xs font-semibold text-white/85">
            {formatEventDate(startsAt)} · {formatEventTimeRange(startsAt, announcement.event_ends_at)}
          </span>
        )}
        {isPast && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded text-white/50" style={{ background: "rgba(255,255,255,0.08)" }}>
            Past
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-base font-bold text-white">{announcement.title}</h3>
          {(announcement.event_location_name || announcement.event_address) && (
            <p className="text-xs text-white/60 mt-1">
              📍 {announcement.event_location_name || announcement.event_address}
              {announcement.event_location_name && announcement.event_address && (
                <span className="text-white/40"> · {announcement.event_address}</span>
              )}
            </p>
          )}
        </div>

        {announcement.content && (
          <p className="text-sm text-white/75 whitespace-pre-wrap leading-relaxed">
            {announcement.content}
          </p>
        )}

        {mapSrc && (
          <div
            className="w-full aspect-video rounded-lg overflow-hidden"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}
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

        <div className="flex flex-wrap gap-2">
          {announcement.event_registration_url && (
            <a
              href={announcement.event_registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-black transition-transform hover:-translate-y-0.5"
              style={{ background: "#FFCB05" }}
            >
              Register
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          )}
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white/85 hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              Get directions
            </a>
          )}
        </div>

        <SponsorRow sponsors={announcement.sponsors} />
      </div>
    </article>
  );
}

function GeneralAnnouncementCard({ announcement }) {
  return (
    <article
      className="rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none mt-0.5">📢</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white">{announcement.title}</h3>
          <p className="text-xs text-white/65 whitespace-pre-wrap mt-1 leading-relaxed">
            {announcement.content}
          </p>
        </div>
      </div>
    </article>
  );
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

  // Group announcements by day for a timeline feel.
  const timelineGroups = useMemo(() => {
    const groups = new Map();
    announcements.forEach((item) => {
      const key = new Date(item.updated_at || item.created_at).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
      });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
  }, [announcements]);

  // Hall of Fame: most recent winners across all award-type announcements.
  const hallOfFame = useMemo(() => {
    const winners = [];
    announcements
      .filter((a) => a.announcement_type === "award")
      .forEach((a) => {
        (a.winners || []).forEach((w) => {
          winners.push({ pitch: w, award: a.award, announcedAt: a.updated_at || a.created_at });
        });
      });
    return winners.slice(0, 8);
  }, [announcements]);

  // Extract long-form text for selected text pitches in the modal.
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
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden">
      <PageBackground src={adminBg} priority quality={68} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, rgba(11,26,59,0.92) 0%, rgba(6,14,33,0.88) 50%, rgba(11,26,59,0.94) 100%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-4">
        <GlassCard>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-white tracking-tight">Announcements</h1>
            <p className="text-sm text-white/50">
              Reminders, winners, and events from the 10KP team.
            </p>
          </div>
        </GlassCard>

        {error && (
          <div
            className="rounded-xl p-3 text-sm"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : announcements.length === 0 ? (
          <GlassCard>
            <p className="text-sm text-white/45">No announcements posted yet.</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main timeline */}
            <div className="lg:col-span-2 space-y-5">
              {timelineGroups.map((group) => (
                <GlassCard key={group.day}>
                  <p className="text-sm font-semibold text-maize mb-3">{group.day}</p>
                  <div className="space-y-3">
                    {group.items.map((item) => {
                      if (item.announcement_type === "award") {
                        return (
                          <AwardAnnouncementCard
                            key={item.id}
                            announcement={item}
                            onOpenPitch={setSelectedPitch}
                          />
                        );
                      }
                      if (item.announcement_type === "event") {
                        return <EventAnnouncementCard key={item.id} announcement={item} />;
                      }
                      return <GeneralAnnouncementCard key={item.id} announcement={item} />;
                    })}
                  </div>
                </GlassCard>
              ))}
            </div>

            {/* Sidebar */}
            <GlassCard>
              <h2 className="text-base font-semibold text-white">🏆 Recent Winners</h2>
              <p className="text-xs text-white/40 mt-0.5 mb-3">Hall of Fame</p>
              {hallOfFame.length === 0 ? (
                <p className="text-sm text-white/40">No winners announced yet.</p>
              ) : (
                <div className="space-y-2">
                  {hallOfFame.map(({ pitch, award }) => {
                    const thumb = getPitchThumbnail(pitch);
                    return (
                      <button
                        key={`${award?.id || "x"}-${pitch.id}`}
                        type="button"
                        onClick={() => setSelectedPitch(pitch)}
                        className="w-full text-left rounded-xl overflow-hidden transition-transform hover:-translate-y-0.5"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={pitch.title}
                            className="w-full aspect-video object-cover"
                          />
                        )}
                        <div className="p-3">
                          <p className="text-sm font-semibold text-white truncate">🥇 {pitch.name}</p>
                          <p className="text-xs text-maize mt-0.5 font-medium truncate">{pitch.title}</p>
                          {award?.name && (
                            <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">
                              {award.name}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <Link
                href="/gallery"
                className="mt-4 flex items-center justify-center w-full py-2 text-xs font-semibold rounded-lg text-black transition-transform hover:-translate-y-0.5"
                style={{ background: "#FFCB05" }}
              >
                Browse Gallery
              </Link>
            </GlassCard>
          </div>
        )}
      </div>

      {/* Pitch preview modal */}
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
