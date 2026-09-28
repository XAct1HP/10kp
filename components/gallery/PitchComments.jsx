"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";

async function getToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

function isUmichEmail(email) {
  return /@umich\.edu$/i.test(String(email || "").trim());
}

/**
 * Public feedback thread on a gallery pitch.
 * Only signed-in @umich.edu accounts can post or vote.
 */
export default function PitchComments({ pitchId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [canComment, setCanComment] = useState(false);
  const [sort, setSort] = useState("top");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState(null);
  const [error, setError] = useState("");

  const umichUser = Boolean(user && isUmichEmail(user.email));
  const canPost = canComment && umichUser;

  const load = useCallback(async () => {
    if (!pitchId) return;
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/gallery/comments?pitchId=${encodeURIComponent(pitchId)}&sort=${sort}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load comments");
      setComments(data.comments || []);
      setReady(data.commentsReady !== false);
      setCanComment(Boolean(data.canComment));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pitchId, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !canPost) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in with your @umich.edu email to comment.");
      const res = await fetch("/api/gallery/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pitchId, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post comment");
      setDraft("");
      setComments((prev) => [data.comment, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (commentId, nextValue) => {
    if (!canPost) {
      setError(
        user
          ? "Only @umich.edu accounts can vote on feedback."
          : "Sign in with your @umich.edu email to vote on feedback."
      );
      return;
    }
    const token = await getToken();
    if (!token) {
      setError("Sign in with your @umich.edu email to vote on feedback.");
      return;
    }
    const current = comments.find((c) => c.id === commentId);
    const value = current?.myVote === nextValue ? 0 : nextValue;
    setVotingId(commentId);
    setError("");
    try {
      const res = await fetch("/api/gallery/comments/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ commentId, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vote failed");
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, score: data.score, myVote: data.myVote }
            : c
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setVotingId(null);
    }
  };

  const remove = async (commentId) => {
    if (!confirm("Delete this comment?")) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/gallery/comments?id=${encodeURIComponent(commentId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!ready) {
    return (
      <div
        className="mt-4 pt-4 flex-shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">
          Feedback
        </h3>
        <p className="text-[11px] text-white/30">
          Feedback isn&apos;t enabled yet. Run{" "}
          <code className="text-[10px] text-white/45">
            migrations/20260928_submitter_profile_comments.sql
          </code>{" "}
          in Supabase.
        </p>
      </div>
    );
  }

  const helperText = !user ? (
    <>
      <Link href="/login" className="text-maize hover:underline">
        Sign in
      </Link>{" "}
      with your @umich.edu email to leave feedback.
    </>
  ) : !umichUser ? (
    "Only accounts signed up with a @umich.edu email can leave feedback."
  ) : (
    "Share constructive feedback for this pitch. Visible to everyone."
  );

  return (
    <div
      className="mt-4 pt-4 flex-shrink-0"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
          Feedback ({comments.length})
        </h3>
        <div className="flex gap-1">
          {["top", "new"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className="px-2 py-0.5 rounded text-[10px] font-semibold capitalize"
              style={{
                background: sort === s ? "rgba(255,203,5,0.15)" : "transparent",
                color: sort === s ? "#FFCB05" : "rgba(255,255,255,0.35)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-300/90 mb-2">{error}</p>}

      <form onSubmit={submit} className="mb-3 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={!canPost || submitting}
          placeholder={
            canPost
              ? "Add feedback for this pitch…"
              : "Sign in with @umich.edu to add feedback…"
          }
          className="w-full px-3 py-2.5 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none resize-none disabled:opacity-60"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: canPost
              ? "1px solid rgba(255,203,5,0.35)"
              : "1px solid rgba(255,255,255,0.1)",
          }}
          aria-label="Pitch feedback"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-white/35 leading-snug">{helperText}</p>
          <button
            type="submit"
            disabled={!canPost || submitting || !draft.trim()}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold text-black disabled:opacity-40"
            style={{ background: "#FFCB05" }}
          >
            {submitting ? "Posting…" : "Post feedback"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-[11px] text-white/30">Loading feedback…</p>
      ) : comments.length === 0 ? (
        <div
          className="rounded-xl px-3 py-4 text-center"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px dashed rgba(255,255,255,0.1)",
          }}
        >
          <p className="text-[11px] text-white/35">
            No feedback yet — be the first to leave a note for this pitch.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg p-2.5"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex gap-2">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-7">
                  <button
                    type="button"
                    disabled={votingId === c.id || !canPost}
                    onClick={() => vote(c.id, 1)}
                    className="p-0.5 disabled:opacity-40"
                    style={{ color: c.myVote === 1 ? "#FFCB05" : "rgba(255,255,255,0.3)" }}
                    aria-label="Upvote"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4l8 10H4L12 4z" />
                    </svg>
                  </button>
                  <span className="text-[10px] font-bold tabular-nums text-white/60">
                    {c.score || 0}
                  </span>
                  <button
                    type="button"
                    disabled={votingId === c.id || !canPost}
                    onClick={() => vote(c.id, -1)}
                    className="p-0.5 disabled:opacity-40"
                    style={{ color: c.myVote === -1 ? "#f87171" : "rgba(255,255,255,0.3)" }}
                    aria-label="Downvote"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 20L4 10h16L12 20z" />
                    </svg>
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[10px] text-white/45 truncate">
                      <span className="text-white/70 font-semibold">
                        {c.author_name || c.author_handle}
                      </span>
                      {" · "}
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                    {user?.id === c.user_id && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="text-[10px] text-white/30 hover:text-red-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">
                    {c.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
