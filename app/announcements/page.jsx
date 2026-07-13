"use client";

import { useEffect, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";

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

function parseWinnerEntry(item) {
  const raw = `${item.title || ""}\n${item.content || ""}`;
  if (!/winner/i.test(raw)) return null;

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const winnerMatch = raw.match(/winner:\s*([^\n]+)/i);
  const pitchMatch = raw.match(/pitch:\s*([^\n]+)/i);

  let winnerName =
    winnerMatch?.[1]?.trim() ||
    item.title?.replace(/winner/gi, "").replace(/announcement/gi, "").trim() ||
    "Winner";

  let pitchTitle = pitchMatch?.[1]?.trim() || "";

  // If pitch is not explicitly labeled, use the next meaningful line after "Winner:"
  if (!pitchTitle && winnerMatch) {
    const winnerLineIndex = lines.findIndex((l) => /winner:/i.test(l));
    if (winnerLineIndex >= 0 && lines[winnerLineIndex + 1]) {
      pitchTitle = lines[winnerLineIndex + 1];
    }
  }

  // Last fallback: try finding a "Pitch Name" style line from content
  if (!pitchTitle) {
    const candidate = lines.find(
      (l) => !/winner/i.test(l) && !/announcement/i.test(l) && l.length > 3
    );
    pitchTitle = candidate || "Winning Pitch";
  }

  return {
    id: item.id,
    winnerName,
    pitchTitle,
    announcementTitle: item.title || "Winner Announcement",
    createdAt: item.updated_at || item.created_at,
  };
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAllSubmissions() {
  let page = 1;
  let hasMore = true;
  const all = [];

  while (hasMore) {
    const res = await fetch(`/api/gallery/submissions?page=${page}&pageSize=24`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to load submissions for Hall of Fame.");
    }
    const batch = data.submissions || [];
    all.push(...batch);
    hasMore = Boolean(data.pagination?.hasMore);
    page += 1;
    if (page > 50) break;
  }

  return all;
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [timelineGroups, setTimelineGroups] = useState([]);
  const [hallOfFame, setHallOfFame] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPitch, setSelectedPitch] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [extractingText, setExtractingText] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnnouncements() {
      try {
        setLoading(true);
        setError("");
        const [annRes, submissions] = await Promise.all([
          fetch("/api/announcements", { cache: "no-store" }),
          fetchAllSubmissions(),
        ]);
        const data = await annRes.json();
        if (!annRes.ok) {
          throw new Error(data.error || "Failed to load announcements.");
        }
        if (!cancelled) {
          const list = data || [];
          setAnnouncements(list);

          const groupedMap = list.reduce((acc, item) => {
            const key = new Date(item.updated_at || item.created_at).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
            });
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
          }, {});

          setTimelineGroups(
            Object.entries(groupedMap).map(([day, items]) => ({ day, items }))
          );

          const winners = list
            .map(parseWinnerEntry)
            .filter(Boolean)
            .map((entry) => {
              const direct = submissions.find(
                (pitch) => normalizeTitle(pitch.title) === normalizeTitle(entry.pitchTitle)
              );
              const partial = direct
                ? null
                : submissions.find((pitch) => {
                    const a = normalizeTitle(pitch.title);
                    const b = normalizeTitle(entry.pitchTitle);
                    return a.includes(b) || b.includes(a);
                  });
              const matchedPitch = direct || partial || null;
              return {
                ...entry,
                matchedPitch,
              };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 6);

          setHallOfFame(winners);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load announcements.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAnnouncements();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setExtractedText("");
    setExtractingText(false);
    if (!selectedPitch?.file_path) return;
    if (!/\.(pdf|doc|docx|txt)$/i.test(selectedPitch.file_name || "")) return;

    let cancelled = false;
    setExtractingText(true);

    fetch(
      `/api/gallery/extract-text?path=${encodeURIComponent(
        selectedPitch.file_path
      )}&name=${encodeURIComponent(selectedPitch.file_name || "")}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.text) {
          setExtractedText(data.text);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setExtractingText(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPitch?.id, selectedPitch?.file_path, selectedPitch?.file_name]);

  const getPitchType = (pitch) => {
    if (!pitch) return "unknown";
    if (pitch.file_type === "video" || pitch.mux_playback_id) return "video";
    if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(pitch.file_name || "")) return "audio";
    return "text";
  };

  const getPitchThumbnail = (pitch) => {
    if (!pitch) return "/placeholder.png";
    if (pitch.thumbnail_path) return pitch.thumbnail_path;
    if (pitch.mux_playback_id) {
      return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1`;
    }
    return "/placeholder.png";
  };

  return (
    <div
      className="relative min-h-[calc(100vh-5rem)] bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url('/admin_bg.png')" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, rgba(11,26,59,0.92) 0%, rgba(6,14,33,0.88) 50%, rgba(11,26,59,0.94) 100%)",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-4">
        <GlassCard>
          <h1 className="text-3xl font-bold text-white">Announcements</h1>
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
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : announcements.length === 0 ? (
          <GlassCard>
            <p className="text-sm text-white/35">No announcements posted yet.</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard className="lg:col-span-2">
              <div className="space-y-5">
                {timelineGroups.map((group) => (
                  <div key={group.day}>
                    <p className="text-sm font-semibold text-maize mb-2">{group.day}</p>
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                        >
                          <p className="text-sm font-semibold text-white">📢 {item.title}</p>
                          <p className="text-xs text-white/60 whitespace-pre-wrap mt-1">
                            {item.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h2 className="text-lg font-semibold text-white">🏆 Recent Winners</h2>
              <p className="text-xs text-white/40 mt-1 mb-3">Hall of Fame</p>
              {hallOfFame.length === 0 ? (
                <p className="text-sm text-white/35">No winner announcements yet.</p>
              ) : (
                <div className="space-y-2">
                  {hallOfFame.map((winner) => (
                    <button
                      key={winner.id}
                      type="button"
                      onClick={() => winner.matchedPitch && setSelectedPitch(winner.matchedPitch)}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                      style={{ width: "100%" }}
                    >
                      <p className="text-sm font-semibold text-white">🥇 {winner.winnerName}</p>
                      <p className="text-xs text-maize mt-1 font-medium">
                        Pitch: {winner.pitchTitle}
                      </p>
                      {winner.matchedPitch ? (
                        <img
                          src={getPitchThumbnail(winner.matchedPitch)}
                          alt={`${winner.matchedPitch.title} thumbnail`}
                          className="w-full aspect-video rounded-lg object-cover border border-white/10 mt-3"
                        />
                      ) : (
                        <p className="text-[11px] text-white/35 mt-2">
                          Media preview unavailable for this winner.
                        </p>
                      )}
                      <p className="text-[11px] text-white/35 mt-1">
                        {winner.announcementTitle}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        )}
      </div>

      {selectedPitch && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setSelectedPitch(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] sm:max-h-[90vh] overflow-auto rounded-2xl border border-white/10 p-4"
            style={{
              background: "rgba(11,26,59,0.96)",
              backdropFilter: "blur(24px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedPitch.title}</h3>
                <p className="text-xs text-white/40 mt-1">By {selectedPitch.name}</p>
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
                accentColor="#F2B517"
                style={{ width: "100%", borderRadius: "0.75rem", overflow: "hidden" }}
              />
            )}

            {getPitchType(selectedPitch) === "audio" && selectedPitch.file_path && (
              <div className="space-y-3">
                <img
                  src={getPitchThumbnail(selectedPitch)}
                  alt={`${selectedPitch.title} thumbnail`}
                  className="w-full max-w-md aspect-video rounded-xl object-cover border border-white/10"
                />
                <audio controls className="w-full">
                  <source
                    src={`/api/gallery/stream-audio?path=${encodeURIComponent(
                      selectedPitch.file_path
                    )}`}
                  />
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {getPitchType(selectedPitch) === "text" && (
              <div className="space-y-3">
                <img
                  src={getPitchThumbnail(selectedPitch)}
                  alt={`${selectedPitch.title} thumbnail`}
                  className="w-full max-w-md aspect-video rounded-xl object-cover border border-white/10"
                />
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
