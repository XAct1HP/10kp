"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../../components/ProtectedRoute";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import "./profile.css";

const MAIZE = "#FFCB05";
const NAVY = "#0B1A3B";

const GLASS = {
  background: "linear-gradient(180deg, rgba(16,32,68,0.72), rgba(11,26,59,0.72))",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow:
    "0 20px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
};

const SUBTLE = {
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.08)",
};

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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function apiUpload(url, formData) {
  const token = await getToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const THUMBNAIL_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;

function statusChip(pitch) {
  const s = pitch.moderation_status || pitch.moderation_state || "pending";
  if (s === "approved") return { label: "Live in gallery", color: "#4ade80", rgb: "74, 222, 128" };
  if (s === "rejected") return { label: "Rejected", color: "#f87171", rgb: "248, 113, 113" };
  if (s === "flagged" || s === "needs_review") {
    return { label: "In review", color: "#fbbf24", rgb: "251, 191, 36" };
  }
  return { label: s || "Pending", color: "#60a5fa", rgb: "96, 165, 250" };
}

function getPitchThumbnail(pitch, defaults = {}) {
  if (pitch?.thumbnail_path) return pitch.thumbnail_path;
  if (pitch?.mux_playback_id) {
    return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1&width=640&height=360&fit_mode=smartcrop`;
  }
  if (
    pitch?.file_type === "audio" ||
    /\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(pitch?.file_name || "")
  ) {
    return defaults.audioThumbnail || null;
  }
  return defaults.textThumbnail || null;
}

function Backdrop() {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, background: NAVY }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 88% 8%, rgba(255, 203, 5, 0.2), transparent 70%), radial-gradient(45% 45% at 4% 96%, rgba(255, 138, 0, 0.14), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 80%)",
        }}
      />
    </div>
  );
}

function PrimaryButton({ children, className = "", href, ...rest }) {
  const classes = `inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_10px_30px_rgba(255,203,5,0.3)] active:enabled:translate-y-0 ${className}`;
  const style = { background: MAIZE, color: NAVY };
  if (href) {
    return (
      <Link href={href} className={classes} style={style} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} style={style} {...rest}>
      {children}
    </button>
  );
}

function GhostButton({ children, className = "", href, ...rest }) {
  const classes = `inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white/75 hover:enabled:text-white hover:enabled:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${className}`;
  const style = { border: "1px solid rgba(255,255,255,0.14)" };
  if (href) {
    return (
      <Link href={href} className={classes} style={style} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} style={style} {...rest}>
      {children}
    </button>
  );
}

function ProfileDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [pitches, setPitches] = useState([]);
  const [comments, setComments] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [defaultThumbnails, setDefaultThumbnails] = useState({
    audioThumbnail: null,
    textThumbnail: null,
  });
  const [loading, setLoading] = useState(true);
  const [commentsReady, setCommentsReady] = useState(true);
  const [viewCountReady, setViewCountReady] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    name: "",
    tagIds: [],
  });
  const [saving, setSaving] = useState(false);
  const [uploadingThumbnailId, setUploadingThumbnailId] = useState(null);
  const [analytics, setAnalytics] = useState({});
  const [loadingAnalytics, setLoadingAnalytics] = useState({});
  const [signingOut, setSigningOut] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/");
    } catch (err) {
      setError(err.message || "Sign out failed.");
      setSigningOut(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pitchData, commentData, tagsResult] = await Promise.all([
        apiFetch("/api/profile/pitches"),
        apiFetch("/api/profile/comments"),
        supabase.from("tags").select("id, name").order("name"),
      ]);
      setPitches(pitchData.pitches || []);
      setViewCountReady(pitchData.viewCountReady !== false);
      setDefaultThumbnails({
        audioThumbnail: pitchData.defaults?.audioThumbnail || null,
        textThumbnail: pitchData.defaults?.textThumbnail || null,
      });
      setComments(commentData.comments || []);
      setCommentsReady(commentData.commentsReady !== false);
      if (!tagsResult.error && tagsResult.data) {
        setAvailableTags(tagsResult.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
  }, [authLoading, user, load]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(t);
  }, [success]);

  const startEdit = (pitch) => {
    setEditingId(pitch.id);
    setDraft({
      title: pitch.title || "",
      description: pitch.description || "",
      name: pitch.name || "",
      tagIds: (pitch.tags || []).map((t) => t.id),
    });
  };

  const toggleDraftTag = (tagId) => {
    setDraft((d) => ({
      ...d,
      tagIds: d.tagIds.includes(tagId)
        ? d.tagIds.filter((id) => id !== tagId)
        : [...d.tagIds, tagId],
    }));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setError("");
    try {
      const data = await apiFetch("/api/profile/pitches", {
        method: "PATCH",
        body: JSON.stringify({
          id: editingId,
          title: draft.title,
          description: draft.description,
          name: draft.name,
          tagIds: draft.tagIds,
        }),
      });
      setPitches((prev) =>
        prev.map((p) => (p.id === editingId ? { ...p, ...data.pitch } : p))
      );
      setEditingId(null);
      setSuccess("Pitch updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changeThumbnail = async (pitchId, file) => {
    if (!file || !pitchId) return;
    if (file.size > MAX_THUMBNAIL_SIZE) {
      setError("Thumbnail must be 5MB or smaller.");
      return;
    }
    if (!THUMBNAIL_TYPES.includes(file.type)) {
      setError("Thumbnail must be PNG, JPG, GIF, or WebP.");
      return;
    }
    setUploadingThumbnailId(pitchId);
    setError("");
    try {
      const fd = new FormData();
      fd.append("id", pitchId);
      fd.append("file", file);
      const data = await apiUpload("/api/profile/pitches/thumbnail", fd);
      setPitches((prev) =>
        prev.map((p) =>
          p.id === pitchId
            ? { ...p, thumbnail_path: data.pitch?.thumbnail_path }
            : p
        )
      );
      setSuccess("Thumbnail updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingThumbnailId(null);
    }
  };

  const loadAnalytics = async (pitchId) => {
    setLoadingAnalytics((p) => ({ ...p, [pitchId]: true }));
    try {
      const data = await apiFetch("/api/profile/pitches", {
        method: "POST",
        body: JSON.stringify({ id: pitchId }),
      });
      setAnalytics((prev) => ({ ...prev, [pitchId]: data }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAnalytics((p) => ({ ...p, [pitchId]: false }));
    }
  };

  const deletePitch = async (pitch) => {
    const title = pitch.title || "this pitch";
    if (
      !confirm(
        `Delete “${title}”? This permanently removes the pitch, its votes, feedback, and media. This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(pitch.id);
    setError("");
    try {
      await apiFetch(
        `/api/profile/pitches?id=${encodeURIComponent(pitch.id)}`,
        { method: "DELETE" }
      );
      setPitches((prev) => prev.filter((p) => p.id !== pitch.id));
      setComments((prev) => prev.filter((c) => c.pitch_id !== pitch.id));
      setAnalytics((prev) => {
        const next = { ...prev };
        delete next[pitch.id];
        return next;
      });
      if (editingId === pitch.id) setEditingId(null);
      setSuccess("Pitch deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="profile-root relative min-h-[calc(100vh-5rem)]">
      <Backdrop />

      <div className="relative z-10 max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-16">
        {/* Hero — matches Ideate intro scale */}
        <header className="profile-rise mb-8 sm:mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-3xl">
              <p
                className="text-xs sm:text-sm uppercase tracking-[0.3em] font-bold mb-4"
                style={{ color: MAIZE }}
              >
                10,000 Pitches · Profile
              </p>
              <h1
                className="font-black text-white tracking-tight leading-[0.98]"
                style={{ fontSize: "clamp(2.4rem, 5.5vw, 4.25rem)" }}
              >
                My{" "}
                <span
                  style={{
                    background:
                      "linear-gradient(90deg, #FFCB05, #FF8A3D 45%, #F472B6 80%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  pitches
                </span>
              </h1>
              <p className="mt-4 text-white/65 text-base sm:text-lg max-w-xl leading-relaxed">
                Edit your submissions, track gallery views, and read the
                feedback left on your pitches. Feedback is private to you.
              </p>
              {user?.email ? (
                <p className="mt-2 text-sm text-white/35 truncate">
                  Signed in as {user.email}
                </p>
              ) : null}
            </div>
            <GhostButton
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex-shrink-0"
            >
              {signingOut ? "Signing out…" : "Sign Out"}
            </GhostButton>
          </div>
        </header>

        {error && (
          <div
            className="profile-rise mb-6 flex items-start gap-3 p-4 text-sm rounded-2xl"
            style={{
              color: "#fca5a5",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            className="profile-rise mb-6 p-4 text-sm rounded-2xl"
            style={{
              color: MAIZE,
              background: "rgba(255,203,5,0.1)",
              border: "1px solid rgba(255,203,5,0.25)",
            }}
          >
            {success}
          </div>
        )}

        {!viewCountReady && (
          <p className="mb-4 text-xs text-amber-300/80">
            View analytics need{" "}
            <code className="text-[10px]">
              migrations/20260928_submitter_profile_comments.sql
            </code>
            .
          </p>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm text-white/50">
            Loading your pitches…
          </div>
        ) : pitches.length === 0 ? (
          <section
            className="profile-rise max-w-lg mx-auto rounded-3xl p-8 sm:p-10 text-center"
            style={GLASS}
          >
            <p className="text-white/70 text-base leading-relaxed mb-8">
              You haven&apos;t submitted a pitch yet. Step into the elevator
              and ride through the floors to submit.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <PrimaryButton href="/intake">Start Your Pitch</PrimaryButton>
              <GhostButton href="/gallery">Browse the Gallery</GhostButton>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            {pitches.map((pitch, index) => {
              const chip = statusChip(pitch);
              const stats = analytics[pitch.id];
              const isEditing = editingId === pitch.id;
              const pitchComments = comments.filter(
                (c) => c.pitch_id === pitch.id
              );
              const thumb = getPitchThumbnail(pitch, defaultThumbnails);
              return (
                <article
                  key={pitch.id}
                  className="profile-rise rounded-3xl p-5 sm:p-7 lg:p-8"
                  style={{
                    ...GLASS,
                    animationDelay: `${Math.min(index, 5) * 60}ms`,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-5">
                    <span
                      className="inline-flex items-center gap-2 rounded-full pl-2.5 pr-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"
                      style={{
                        background: "rgba(255,203,5,0.14)",
                        color: MAIZE,
                        border: "1px solid rgba(255,203,5,0.3)",
                      }}
                    >
                      Pitch {index + 1} of {pitches.length}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{
                        color: chip.color,
                        background: `rgba(${chip.rgb}, 0.14)`,
                        border: `1px solid rgba(${chip.rgb}, 0.3)`,
                      }}
                    >
                      {chip.label}
                    </span>
                  </div>

                  <div className="flex gap-4 sm:gap-5 mb-5">
                    <div
                      className="relative flex-shrink-0 w-28 sm:w-36 aspect-video rounded-2xl overflow-hidden"
                      style={SUBTLE}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] uppercase tracking-wider text-white/30">
                            {pitch.file_type || "pitch"}
                          </span>
                        </div>
                      )}
                      {isEditing && (
                        <label
                          className="absolute inset-0 flex items-end justify-center pb-2 cursor-pointer"
                          style={{
                            background:
                              "linear-gradient(to top, rgba(0,0,0,0.65), transparent 55%)",
                          }}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                            {uploadingThumbnailId === pitch.id
                              ? "Uploading…"
                              : "Change"}
                          </span>
                          <input
                            type="file"
                            accept={THUMBNAIL_TYPES.join(",")}
                            className="sr-only"
                            disabled={uploadingThumbnailId === pitch.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) changeThumbnail(pitch.id, file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2
                        className="font-black text-white tracking-tight leading-tight"
                        style={{ fontSize: "clamp(1.25rem, 2.4vw, 1.75rem)" }}
                      >
                        {pitch.title}
                      </h2>
                      <p className="text-white/45 text-sm mt-1">
                        by {pitch.name}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-white/45">
                        <span>
                          Views{" "}
                          <strong className="text-white/80 tabular-nums">
                            {pitch.view_count ?? 0}
                          </strong>
                        </span>
                        <span>
                          Votes{" "}
                          <strong className="text-white/80 tabular-nums">
                            {pitch.vote_count ?? 0}
                          </strong>
                        </span>
                        <span>
                          Feedback{" "}
                          <strong className="text-white/80 tabular-nums">
                            {pitch.comment_count ?? pitchComments.length}
                          </strong>
                        </span>
                        <span className="text-white/25">
                          {pitch.created_at
                            ? new Date(pitch.created_at).toLocaleDateString()
                            : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-5 mb-5">
                      <div>
                        <label className="block text-[15px] font-semibold text-white mb-2">
                          Title
                        </label>
                        <input
                          value={draft.title}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, title: e.target.value }))
                          }
                          className="profile-input w-full px-4 py-3 rounded-xl text-sm sm:text-[15px] text-white placeholder-white/25"
                        />
                      </div>
                      <div>
                        <label className="block text-[15px] font-semibold text-white mb-2">
                          Display name
                        </label>
                        <input
                          value={draft.name}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, name: e.target.value }))
                          }
                          className="profile-input w-full px-4 py-3 rounded-xl text-sm sm:text-[15px] text-white placeholder-white/25"
                        />
                      </div>
                      <div>
                        <label className="block text-[15px] font-semibold text-white mb-2">
                          Description
                        </label>
                        <textarea
                          value={draft.description}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              description: e.target.value,
                            }))
                          }
                          rows={4}
                          className="profile-input w-full px-4 py-3 rounded-xl text-sm sm:text-[15px] text-white placeholder-white/25 leading-relaxed resize-y"
                        />
                      </div>
                      <div>
                        <label className="block text-[15px] font-semibold text-white mb-2">
                          Thumbnail
                        </label>
                        <p className="text-white/40 text-xs mb-3">
                          Upload PNG, JPG, GIF, or WebP ( 5MB size maximum )
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <div
                            className="relative w-32 aspect-video rounded-xl overflow-hidden flex-shrink-0"
                            style={SUBTLE}
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30 uppercase tracking-wider">
                                None
                              </div>
                            )}
                          </div>
                          <label
                            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white/75 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                            style={{ border: "1px solid rgba(255,255,255,0.14)" }}
                          >
                            {uploadingThumbnailId === pitch.id
                              ? "Uploading…"
                              : "Choose new image"}
                            <input
                              type="file"
                              accept={THUMBNAIL_TYPES.join(",")}
                              className="sr-only"
                              disabled={uploadingThumbnailId === pitch.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) changeThumbnail(pitch.id, file);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[15px] font-semibold text-white mb-3">
                          Tags
                        </label>
                        {availableTags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {availableTags.map((tag) => {
                              const selected = draft.tagIds.includes(tag.id);
                              return (
                                <button
                                  key={tag.id}
                                  type="button"
                                  onClick={() => toggleDraftTag(tag.id)}
                                  className="px-3.5 py-2 text-sm rounded-full font-semibold transition-all"
                                  style={{
                                    border: selected
                                      ? "1px solid rgba(255,203,5,0.45)"
                                      : "1px solid rgba(255,255,255,0.14)",
                                    background: selected
                                      ? "rgba(255,203,5,0.14)"
                                      : "rgba(255,255,255,0.035)",
                                    color: selected
                                      ? MAIZE
                                      : "rgba(255,255,255,0.7)",
                                  }}
                                >
                                  {tag.name}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-white/40 italic">
                            No tags available yet.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 pt-1">
                        <GhostButton onClick={() => setEditingId(null)}>
                          Cancel
                        </GhostButton>
                        <PrimaryButton onClick={saveEdit} disabled={saving}>
                          {saving ? "Saving…" : "Save changes"}
                        </PrimaryButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/40 mb-2">
                          Description
                        </p>
                        <p className="text-[15px] text-white/70 leading-relaxed line-clamp-4">
                          {pitch.description}
                        </p>
                      </div>
                      <div className="mb-5">
                        <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/40 mb-2">
                          Tags
                        </p>
                        {(pitch.tags || []).length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {pitch.tags.map((tag) => (
                              <span
                                key={tag.id}
                                className="px-3 py-1.5 text-xs rounded-full font-semibold"
                                style={{
                                  background: "rgba(255,203,5,0.12)",
                                  color: MAIZE,
                                  border: "1px solid rgba(255,203,5,0.28)",
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-white/35 italic">
                            No tags yet — edit to add some.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  <div className="flex flex-wrap gap-2 mb-5">
                    {!isEditing && (
                      <GhostButton onClick={() => startEdit(pitch)}>
                        Edit pitch
                      </GhostButton>
                    )}
                    <PrimaryButton
                      href={`/gallery?pitch=${encodeURIComponent(pitch.id)}`}
                    >
                      Open in gallery
                    </PrimaryButton>
                    <GhostButton
                      onClick={() => loadAnalytics(pitch.id)}
                      disabled={loadingAnalytics[pitch.id]}
                    >
                      {loadingAnalytics[pitch.id]
                        ? "Loading…"
                        : "Refresh analytics"}
                    </GhostButton>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${origin}/gallery?pitch=${encodeURIComponent(pitch.id)}`;
                        navigator.clipboard?.writeText(url);
                        setSuccess("Gallery link copied.");
                      }}
                      className="inline-flex items-center px-4 py-3 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 transition-colors"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePitch(pitch)}
                      disabled={deletingId === pitch.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
                      style={{
                        color: "#fca5a5",
                        border: "1px solid rgba(248,113,113,0.35)",
                        background: "rgba(248,113,113,0.08)",
                      }}
                    >
                      {deletingId === pitch.id ? "Deleting…" : "Delete pitch"}
                    </button>
                  </div>

                  {stats && (
                    <div
                      className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 rounded-2xl p-4"
                      style={SUBTLE}
                    >
                      <Stat label="Gallery views" value={stats.galleryViews} />
                      <Stat label="Votes" value={stats.voteCount} />
                      <Stat label="Comments" value={stats.commentCount} />
                      <Stat
                        label="Mux video views"
                        value={
                          stats.muxViews == null ? "—" : stats.muxViews
                        }
                      />
                    </div>
                  )}

                  <div
                    className="pt-5"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/40 mb-3">
                      Feedback on this pitch
                    </p>
                    {!commentsReady ? (
                      <p className="text-sm text-white/35">
                        Feedback migrations not applied yet.
                      </p>
                    ) : pitchComments.length === 0 ? (
                      <p className="text-sm text-white/35">No feedback yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {pitchComments.slice(0, 8).map((c) => (
                          <li
                            key={c.id}
                            className="rounded-2xl px-4 py-3"
                            style={SUBTLE}
                          >
                            <div className="flex justify-between gap-2 mb-1">
                              <span className="text-xs text-white/50">
                                <span className="text-white/80 font-semibold">
                                  {c.author_name || c.author_handle}
                                </span>
                              </span>
                              <span className="text-xs text-white/30 tabular-nums">
                                {new Date(c.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                              {c.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              );
            })}

            <div
              className="profile-rise flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2"
              style={{ animationDelay: "200ms" }}
            >
              <PrimaryButton href="/intake" className="sm:flex-1">
                Submit another pitch
              </PrimaryButton>
              <GhostButton href="/gallery" className="sm:flex-1">
                View Gallery
              </GhostButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/35 mb-1">
        {label}
      </p>
      <p className="text-lg font-black tabular-nums text-white">{value}</p>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute showLoading={false}>
      <ProfileDashboard />
    </ProtectedRoute>
  );
}
