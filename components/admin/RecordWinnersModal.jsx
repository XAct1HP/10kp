"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
};

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function pitchThumbUrl(pitch) {
  if (pitch?.mux_playback_id) {
    return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?width=160&height=90&fit_mode=smartcrop`;
  }
  return null;
}

/**
 * RecordWinnersModal — creates a new award-type announcement.
 *
 * Each open of this modal produces one fresh announcement listing the
 * winners the admin picks. Previous announcements for the same award
 * are untouched — no cycle state to reason about.
 *
 * Props:
 *   award: { id, name, prize?, sponsors?[] }
 *   apiFetch: (url, opts?) => Promise
 *   onClose: () => void
 *   onCreated: (announcement) => void   — parent can toast + refresh
 *   onError, onSuccess: (msg) => void
 */
export default function RecordWinnersModal({
  award,
  apiFetch,
  onClose,
  onCreated,
  onError,
  onSuccess,
}) {
  const [selected, setSelected] = useState([]); // array of pitch objects (ordered)
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [title, setTitle] = useState(`${award.name} — Winner Announcement`);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);

  // Load initial results on open (empty query returns newest pitches).
  const runSearch = useCallback(async (q) => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("limit", "30");
      const data = await apiFetch(`/api/admin/pitches/search?${params.toString()}`);
      setResults(data || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSearching(false);
    }
  }, [apiFetch, onError]);

  useEffect(() => { runSearch(debouncedQuery); }, [debouncedQuery, runSearch]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  const addPitch = (pitch) => {
    if (selectedIds.has(pitch.id)) return;
    setSelected((prev) => [...prev, pitch]);
  };

  const removePitch = (id) => setSelected((prev) => prev.filter((p) => p.id !== id));

  const move = (id, direction) => {
    setSelected((prev) => {
      const list = [...prev];
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) return list;
      const target = idx + direction;
      if (target < 0 || target >= list.length) return list;
      [list[idx], list[target]] = [list[target], list[idx]];
      return list;
    });
  };

  const canSubmit =
    !submitting &&
    title.trim() &&
    content.trim() &&
    selected.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        is_published: true,
        announcement_type: "award",
        award_id: award.id,
        winner_pitch_ids: selected.map((p) => p.id),
      };
      const created = await apiFetch("/api/admin/announcements", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSuccess?.(
        `Announced ${selected.length} winner${selected.length === 1 ? "" : "s"} for ${award.name}`
      );
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,14,33,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-winners-title"
        className="w-full max-w-4xl max-h-[calc(100vh-4rem)] rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: "rgba(11,26,59,0.95)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold" style={{ color: "#FFCB05" }}>
              Record Winners
            </p>
            <h2 id="record-winners-title" className="text-lg font-bold text-white tracking-tight">
              {award.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/60 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
          {/* Left column — pitch picker */}
          <div className="flex flex-col min-h-0 border-r" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="p-4 flex-shrink-0">
              <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                Search pitches
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, name, or description..."
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-maize"
                style={inputStyle}
                autoFocus
              />
              <p className="mt-2 text-[10px] text-white/30">
                Showing {results.length} result{results.length === 1 ? "" : "s"}. Seed pitches are excluded — only intake-form submissions are eligible.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 space-y-2">
              {searching && results.length === 0 ? (
                <p className="text-sm text-white/40 py-6 text-center">Searching...</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-white/40 py-6 text-center">No pitches match.</p>
              ) : (
                results.map((pitch) => {
                  const alreadyAdded = selectedIds.has(pitch.id);
                  const thumb = pitchThumbUrl(pitch);
                  return (
                    <button
                      key={pitch.id}
                      type="button"
                      onClick={() => addPitch(pitch)}
                      disabled={alreadyAdded}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                        alreadyAdded
                          ? "opacity-40 cursor-default"
                          : "hover:bg-white/[0.04]"
                      }`}
                      style={{
                        background: alreadyAdded ? "rgba(255,203,5,0.06)" : "rgba(255,255,255,0.03)",
                        border: alreadyAdded
                          ? "1px solid rgba(255,203,5,0.25)"
                          : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div
                        className="w-16 h-10 rounded flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ background: "rgba(0,0,0,0.3)" }}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[9px] text-white/40 uppercase">{pitch.file_type || "text"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{pitch.title}</p>
                        <p className="text-xs text-white/50 truncate">
                          {pitch.name}
                          {pitch.role ? ` • ${pitch.role}` : ""}
                        </p>
                        {pitch.moderation_status && pitch.moderation_status !== "approved" && (
                          <p className="text-[10px] text-amber-300/80 mt-0.5 uppercase tracking-wider">
                            {pitch.moderation_status}
                          </p>
                        )}
                      </div>
                      <span className={`text-lg flex-shrink-0 ${alreadyAdded ? "text-maize" : "text-white/40"}`}>
                        {alreadyAdded ? "✓" : "+"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right column — form */}
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-2">
                  Winners ({selected.length})
                </label>
                {selected.length === 0 ? (
                  <p className="text-xs text-white/40 italic p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                    No winners selected yet. Pick pitches from the left.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selected.map((pitch, idx) => (
                      <div
                        key={pitch.id}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                        style={{
                          background: "rgba(255,203,5,0.08)",
                          border: "1px solid rgba(255,203,5,0.25)",
                        }}
                      >
                        <span className="text-[11px] text-white/50 tabular-nums w-5">#{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{pitch.title}</p>
                          <p className="text-[11px] text-white/50 truncate">{pitch.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => move(pitch.id, -1)}
                          disabled={idx === 0}
                          className="text-xs text-white/50 hover:text-white disabled:opacity-20 px-1.5"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(pitch.id, 1)}
                          disabled={idx === selected.length - 1}
                          className="text-xs text-white/50 hover:text-white disabled:opacity-20 px-1.5"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removePitch(pitch.id)}
                          className="text-xs text-red-300 hover:text-red-200 px-1.5"
                          aria-label="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                  Announcement title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-maize"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                  Announcement message
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={6}
                  placeholder="Congratulations! This week's winners were selected for..."
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-maize resize-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-[10px] text-white/30">
                  Your message appears above the winner cards. The award&apos;s sponsors are attached automatically.
                </p>
              </div>

              {award.sponsors?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
                    Sponsor{award.sponsors.length === 1 ? "" : "s"} shown on this announcement
                  </p>
                  <div className="flex flex-wrap gap-2">
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
            </div>

            {/* Footer */}
            <div
              className="px-4 py-3 flex items-center justify-end gap-2 flex-shrink-0"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <button
                type="button"
                onClick={onClose}
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
                {submitting ? "Publishing..." : "Publish announcement"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
