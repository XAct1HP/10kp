"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

async function getToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

async function apiFetch(url, options = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const STATUS_STYLE = {
  approved: {
    label: "Delivered",
    color: "#4ade80",
    bg: "rgba(74,222,128,0.12)",
    rail: "rgba(74,222,128,0.35)",
  },
  pending: {
    label: "In review",
    color: "#FFCB05",
    bg: "rgba(255,203,5,0.12)",
    rail: "rgba(255,203,5,0.4)",
  },
  blocked: {
    label: "Blocked",
    color: "#f87171",
    bg: "rgba(248,113,113,0.14)",
    rail: "rgba(248,113,113,0.45)",
  },
};

function statusStyle(comment) {
  return STATUS_STYLE[comment.moderation_status] || STATUS_STYLE.pending;
}

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * The complete feedback record for one pitch, for admins only.
 *
 * Collapsed by default and fetched on first open — a pitch modal should not
 * pay for a second query every time an admin clicks a row to check a
 * moderation flag. Every state is shown, including comments moderation
 * blocked and comments their authors withdrew, because an incomplete record
 * is the one thing this panel must not be.
 */
export default function PitchFeedbackThread({ pitchId, pitchTitle }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [counts, setCounts] = useState({});
  const [ready, setReady] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [sort, setSort] = useState("new");

  // A different pitch means a different thread; collapse and forget.
  useEffect(() => {
    setOpen(false);
    setLoaded(false);
    setComments([]);
    setCounts({});
    setError("");
  }, [pitchId]);

  const load = useCallback(async () => {
    if (!pitchId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/admin/pitches/comments?pitchId=${encodeURIComponent(pitchId)}`
      );
      setComments(data.comments || []);
      setCounts(data.counts || {});
      setReady(data.commentsReady !== false && data.moderationReady !== false);
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pitchId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) load();
  };

  const decide = async (commentId, action) => {
    setBusyId(commentId);
    setError("");
    try {
      const data = await apiFetch("/api/admin/pitches/comments", {
        method: "PATCH",
        body: JSON.stringify({ id: commentId, action }),
      });
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, ...data.comment } : c))
      );
      setCounts((prev) => {
        const before = comments.find((c) => c.id === commentId);
        if (!before) return prev;
        const from = before.moderation_status === "approved" ? "approved"
          : before.moderation_status === "blocked" ? "blocked" : "pending";
        const to = action === "approve" ? "approved" : "blocked";
        if (from === to) return prev;
        return {
          ...prev,
          [from]: Math.max(0, (prev[from] || 0) - 1),
          [to]: (prev[to] || 0) + 1,
        };
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const ordered = [...comments].sort((a, b) => {
    if (sort === "flagged") {
      const rank = (c) =>
        c.moderation_status === "pending" ? 0 : c.moderation_status === "blocked" ? 1 : 2;
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const total = counts.total ?? comments.length;
  const needsAttention = (counts.pending || 0) + (counts.blocked || 0);

  return (
    <div
      className="mx-4 sm:mx-7 mb-5 mt-1 rounded-xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <svg
            className="w-4 h-4 flex-shrink-0 text-white/35"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">
            Pitch Feedback
          </p>
          <span className="text-xs text-white/35 tabular-nums">({total})</span>
          {needsAttention > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(255,203,5,0.14)", color: "#FFCB05" }}
            >
              {counts.pending ? `${counts.pending} in review` : null}
              {counts.pending && counts.blocked ? " · " : null}
              {counts.blocked ? `${counts.blocked} blocked` : null}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-white/30 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="px-4 pb-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          {error && <p className="text-xs text-red-300/90 pt-3">{error}</p>}

          {!ready && (
            <p className="text-xs text-amber-300/80 pt-3">
              Feedback moderation needs{" "}
              <code className="text-[10px]">
                migrations/20261005_comment_moderation.sql
              </code>
              .
            </p>
          )}

          {loading && !loaded ? (
            <p className="text-xs text-white/35 pt-3">Loading feedback…</p>
          ) : loaded && comments.length === 0 ? (
            <p className="text-xs text-white/30 pt-3">
              No feedback has been left on this pitch.
            </p>
          ) : loaded ? (
            <>
              <div className="flex items-center justify-between gap-2 pt-3 pb-2">
                <p className="text-[10px] text-white/25 leading-snug">
                  Everything said about {pitchTitle ? `“${pitchTitle}”` : "this pitch"} —
                  the submitter only sees what is delivered.
                </p>
                <div className="flex gap-1 flex-shrink-0">
                  {[
                    { id: "new", label: "Newest" },
                    { id: "flagged", label: "Needs review" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSort(s.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{
                        background: sort === s.id ? "rgba(255,203,5,0.15)" : "transparent",
                        color: sort === s.id ? "#FFCB05" : "rgba(255,255,255,0.35)",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <ul className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                {ordered.map((c) => {
                  const style = statusStyle(c);
                  const flags = c.moderation_categories || [];
                  return (
                    <li
                      key={c.id}
                      className="rounded-lg pl-3 pr-3 py-2.5"
                      style={{
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderLeft: `2px solid ${style.rail}`,
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{ background: style.bg, color: style.color }}
                        >
                          {style.label}
                        </span>
                        {c.is_deleted && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
                          >
                            Withdrawn
                          </span>
                        )}
                        <span className="text-[11px] text-white/55 font-semibold truncate">
                          {c.author_name || c.author_handle}
                        </span>
                        <span className="text-[10px] text-white/25 truncate">
                          {c.author_email}
                        </span>
                        <span className="text-[10px] text-white/20">
                          · {relativeTime(c.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-white/75 leading-relaxed whitespace-pre-wrap">
                        {c.body}
                      </p>

                      <div
                        className="mt-2 pt-2"
                        style={{ borderTop: "1px dashed rgba(255,255,255,0.07)" }}
                      >
                          {c.moderation_summary && (
                            <p className="text-[10px] text-white/40 leading-snug">
                              {c.moderation_summary}
                            </p>
                          )}
                          {flags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {flags.map((f, i) => (
                                <span
                                  key={`${c.id}-flag-${i}`}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                  style={{
                                    background: "rgba(248,113,113,0.1)",
                                    color: "rgba(248,113,113,0.8)",
                                  }}
                                  title={f.explanation || ""}
                                >
                                  {f.category}
                                  {f.severity ? ` · ${f.severity}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {c.moderation_status !== "approved" && (
                              <button
                                type="button"
                                disabled={busyId === c.id}
                                onClick={() => decide(c.id, "approve")}
                                className="px-2 py-1 rounded-md text-[10px] font-semibold text-black bg-green-400 hover:bg-green-300 transition-colors disabled:opacity-50"
                              >
                                {busyId === c.id ? "Saving…" : "Deliver"}
                              </button>
                            )}
                            {c.moderation_status !== "blocked" && (
                              <button
                                type="button"
                                disabled={busyId === c.id}
                                onClick={() => decide(c.id, "block")}
                                className="px-2 py-1 rounded-md text-[10px] font-semibold text-white/70 bg-white/[0.06] hover:bg-red-500/15 hover:text-red-300 border border-white/10 transition-colors disabled:opacity-50"
                              >
                                {busyId === c.id ? "Saving…" : "Block"}
                              </button>
                            )}
                            {c.moderation_reviewed_by && (
                              <span className="text-[9px] text-white/25">
                                by {c.moderation_reviewed_by}
                              </span>
                            )}
                          </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
