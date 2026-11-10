"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

function pitchThumb(pitch) {
  if (pitch?.thumbnail_path) return pitch.thumbnail_path;
  if (pitch?.mux_playback_id && pitch.file_type !== "audio") {
    return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?height=90`;
  }
  return null;
}

/**
 * Admin Hall of Fame editor.
 *
 * HoF content still comes from published award announcements (same as
 * Announcements → Record Winners). This tab is the ceremony-facing surface:
 * preview who will appear, record/edit winners per award, and flip public
 * visibility when ready.
 */
export default function HallOfFameAdminPanel({ apiFetch, onError, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [savingPublic, setSavingPublic] = useState(false);
  const [data, setData] = useState(null);
  const [recordingFor, setRecordingFor] = useState(null);
  const [editingAward, setEditingAward] = useState(null);
  const [busyAnnouncementId, setBusyAnnouncementId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFetch("/api/admin/hall-of-fame");
      setData(payload);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const winnersByAward = useMemo(() => {
    const map = new Map();
    for (const w of data?.winners || []) {
      const id = w.award?.id || "unknown";
      if (!map.has(id)) {
        map.set(id, {
          award: w.award,
          winners: [],
        });
      }
      map.get(id).winners.push(w);
    }
    return [...map.values()].sort(
      (a, b) => (a.award?.sort_order ?? 999) - (b.award?.sort_order ?? 999)
    );
  }, [data?.winners]);

  const handleTogglePublic = async () => {
    if (!data) return;
    const next = !data.isPublic;
    setSavingPublic(true);
    setData((prev) => (prev ? { ...prev, isPublic: next } : prev));
    try {
      await apiFetch("/api/admin/competition-date", {
        method: "POST",
        body: JSON.stringify({ hall_of_fame_public: next }),
      });
      onSuccess?.(
        next
          ? "Hall of Fame is now public on the site."
          : "Hall of Fame is private (admins only)."
      );
    } catch (err) {
      setData((prev) => (prev ? { ...prev, isPublic: !next } : prev));
      onError?.(err.message);
    } finally {
      setSavingPublic(false);
    }
  };

  const handleTogglePublished = async (announcement) => {
    setBusyAnnouncementId(announcement.id);
    try {
      await apiFetch("/api/admin/announcements", {
        method: "PUT",
        body: JSON.stringify({
          id: announcement.id,
          is_published: !announcement.is_published,
        }),
      });
      onSuccess?.(
        announcement.is_published
          ? "Winner announcement unpublished — removed from Hall of Fame."
          : "Winner announcement published — now on Hall of Fame."
      );
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusyAnnouncementId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const isPublic = !!data?.isPublic;
  const year = data?.year;
  const awards = data?.awards || [];
  const latestByAward = data?.latestByAward || {};
  const awardAnnouncements = data?.awardAnnouncements || [];

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto no-scrollbar pr-1">
      {/* Visibility + preview link */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white">Hall of Fame</h2>
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                style={{
                  background: isPublic ? "rgba(74,222,128,0.15)" : "rgba(255,203,5,0.12)",
                  color: isPublic ? "#86efac" : "#FFCB05",
                }}
              >
                {isPublic ? "Public" : "Private"}
              </span>
            </div>
            <p className="text-xs text-white/40 mt-1">
              {year ? `${year} competition` : "This competition"} — {data?.count || 0} winner
              {(data?.count || 0) === 1 ? "" : "s"} shown on the page. Winners come from
              published award announcements (same as Announcements → Record Winners).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/hall-of-fame"
              target="_blank"
              className="px-3 py-2 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.12)" }}
            >
              Preview page
            </Link>
            <button
              type="button"
              onClick={handleTogglePublic}
              disabled={savingPublic}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors disabled:opacity-50"
            >
              {savingPublic
                ? "Saving…"
                : isPublic
                ? "Make private"
                : "Make public"}
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Live composition preview */}
      <GlassCard>
        <h3 className="text-sm font-bold text-white mb-1">Currently on Hall of Fame</h3>
        <p className="text-xs text-white/40 mb-4">
          This is exactly what visitors see when the page is public (admins can always preview).
        </p>
        {winnersByAward.length === 0 ? (
          <p className="text-sm text-white/45 italic">
            No winners yet. Record winners for an award below — published announcements appear here.
          </p>
        ) : (
          <div className="space-y-5">
            {winnersByAward.map(({ award, winners }) => (
              <div key={award?.id || "unknown"}>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-maize">
                    {award?.name || "Award"}
                  </p>
                  {award?.prize && (
                    <p className="text-[11px] text-white/35 truncate">{award.prize}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {winners.map((w) => {
                    const thumb = pitchThumb(w);
                    return (
                      <div
                        key={`${w.id}:${award?.id}`}
                        className="flex items-center gap-3 rounded-xl p-2.5"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-black/30"
                        >
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-white/25">
                              {w.file_type || "pitch"}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{w.title}</p>
                          <p className="text-[11px] text-white/40 truncate">{w.name}</p>
                          {w.source === "archive" && (
                            <p className="text-[10px] text-white/25 mt-0.5">Archive seed</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Per-award actions */}
      <GlassCard>
        <h3 className="text-sm font-bold text-white mb-1">Edit by award</h3>
        <p className="text-xs text-white/40 mb-4">
          Record a new winner announcement or edit the latest one. Unpublishing removes those
          winners from the Hall of Fame.
        </p>
        {awards.length === 0 ? (
          <p className="text-sm text-white/40 italic">
            No awards defined yet. Create awards in Settings → Awards first.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {awards.map((award) => {
              const latest = latestByAward[award.id];
              const liveCount = (data?.winners || []).filter(
                (w) => w.award?.id === award.id && w.source === "announcement"
              ).length;
              return (
                <div
                  key={award.id}
                  className="rounded-xl p-4 flex flex-col gap-3"
                  style={{
                    background: "rgba(255,203,5,0.04)",
                    border: "1px solid rgba(255,203,5,0.18)",
                  }}
                >
                  <div>
                    <p className="text-sm font-bold text-white">{award.name}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                      {liveCount > 0
                        ? `${liveCount} on Hall of Fame`
                        : latest
                        ? latest.is_published
                          ? "Published announcement on file"
                          : "Draft announcement on file"
                        : "No winner announcement yet"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <button
                      type="button"
                      onClick={() => setRecordingFor(award)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors"
                    >
                      Record winners
                    </button>
                    {latest && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingAward({
                              award,
                              announcement: {
                                ...latest,
                                // RecordWinnersModal expects winners as pitch objects.
                                winners: latest.winners || [],
                              },
                            })
                          }
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors"
                          style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                        >
                          Edit latest
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePublished(latest)}
                          disabled={busyAnnouncementId === latest.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors disabled:opacity-40"
                          style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                        >
                          {busyAnnouncementId === latest.id
                            ? "…"
                            : latest.is_published
                            ? "Unpublish"
                            : "Publish"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Full announcement list for this competition's awards */}
      {awardAnnouncements.length > 0 && (
        <GlassCard>
          <h3 className="text-sm font-bold text-white mb-1">Award announcements</h3>
          <p className="text-xs text-white/40 mb-4">
            Every award-type announcement. Only published ones feed the Hall of Fame.
          </p>
          <div className="divide-y divide-white/[0.05]">
            {awardAnnouncements.map((a) => (
              <div
                key={a.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">{a.title}</p>
                    <span
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                      style={{
                        background: a.is_published
                          ? "rgba(74,222,128,0.12)"
                          : "rgba(255,255,255,0.08)",
                        color: a.is_published ? "#86efac" : "rgba(255,255,255,0.45)",
                      }}
                    >
                      {a.is_published ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/35 mt-0.5">
                    {a.award?.name || "Award"} · {(a.winners || []).length} winner
                    {(a.winners || []).length === 1 ? "" : "s"}
                    {a.updated_at
                      ? ` · updated ${new Date(a.updated_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingAward({
                        award:
                          awards.find((x) => x.id === a.award_id) ||
                          a.award ||
                          { id: a.award_id, name: "Award", sponsors: [] },
                        announcement: { ...a, winners: a.winners || [] },
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors"
                    style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTogglePublished(a)}
                    disabled={busyAnnouncementId === a.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors disabled:opacity-40"
                    style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    {busyAnnouncementId === a.id
                      ? "…"
                      : a.is_published
                      ? "Unpublish"
                      : "Publish"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {recordingFor && (
        <RecordWinnersModal
          award={recordingFor}
          apiFetch={apiFetch}
          onClose={() => setRecordingFor(null)}
          onError={onError}
          onSuccess={onSuccess}
          onCreated={async () => {
            setRecordingFor(null);
            await load();
          }}
        />
      )}

      {editingAward && (
        <RecordWinnersModal
          key={editingAward.announcement.id}
          award={editingAward.award}
          existing={editingAward.announcement}
          apiFetch={apiFetch}
          onClose={() => setEditingAward(null)}
          onError={onError}
          onSuccess={onSuccess}
          onCreated={async () => {
            setEditingAward(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
