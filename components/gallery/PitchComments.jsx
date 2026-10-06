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

const STATE_STYLE = {
  delivered: { label: "Delivered", color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  in_review: { label: "In review", color: "#FFCB05", bg: "rgba(255,203,5,0.12)" },
  blocked: { label: "Not delivered", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

/**
 * Private feedback on a gallery pitch.
 *
 * Feedback is not a public thread. What a student writes here goes to the
 * person who made the pitch — after moderation — and to admins. It is never
 * shown to other visitors, so this component only ever renders the signed-in
 * user's own notes, with the state of each one.
 */
export default function PitchComments({ pitchId }) {
  const { user } = useAuth();
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [canComment, setCanComment] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
        `/api/gallery/comments?pitchId=${encodeURIComponent(pitchId)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load your feedback");
      setMine(data.mine || []);
      setReady(data.commentsReady !== false);
      setCanComment(Boolean(data.canComment));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pitchId]);

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
      if (!token) throw new Error("Sign in with your @umich.edu email to leave feedback.");
      const res = await fetch("/api/gallery/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pitchId, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send feedback");
      setDraft("");
      setMine((prev) => [data.comment, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (commentId) => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(
        `/api/gallery/comments?id=${encodeURIComponent(commentId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setMine((prev) => prev.filter((c) => c.id !== commentId));
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
          Leave feedback
        </h3>
        <p className="text-[11px] text-white/30">
          Feedback isn&apos;t enabled yet. Run{" "}
          <code className="text-[10px] text-white/45">
            migrations/20260928_submitter_profile_comments.sql
          </code>{" "}
          then{" "}
          <code className="text-[10px] text-white/45">
            migrations/20261005_comment_moderation.sql
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
    "Goes privately to whoever made this pitch after a quick review. Other visitors never see it."
  );

  return (
    <div
      className="mt-4 pt-4 flex-shrink-0"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
          Leave feedback
        </h3>
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Private
        </span>
      </div>
      <p className="text-[11px] text-white/30 mb-3 leading-snug">
        Only the person who made this pitch will read it.
      </p>

      {error && <p className="text-[11px] text-red-300/90 mb-2">{error}</p>}

      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={!canPost || submitting}
          placeholder={
            canPost
              ? "What worked, what you'd change…"
              : "Sign in with @umich.edu to leave feedback…"
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
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </div>
      </form>

      {/* The author's own notes, so they can tell a submission registered. */}
      {!loading && mine.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2">
            Your feedback on this pitch
          </p>
          <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {mine.map((c) => {
              const style = STATE_STYLE[c.state] || STATE_STYLE.in_review;
              return (
                <li
                  key={c.id}
                  className="rounded-lg p-2.5"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {style.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/25">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="text-[10px] text-white/30 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">
                    {c.body}
                  </p>
                  {c.note && (
                    <p className="text-[10px] text-white/30 mt-1.5">{c.note}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
