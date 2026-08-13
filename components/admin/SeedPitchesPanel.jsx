"use client";

import { useEffect, useRef, useState } from "react";

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

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_SIZE = 500 * 1024 * 1024;

function statusLabel(pitch) {
  if (pitch.mux_playback_id) return { label: "Ready", color: "#4ade80" };
  if (pitch.mux_error) return { label: "Error", color: "#f87171" };
  return { label: pitch.mux_status || "Processing", color: "#fbbf24" };
}

/**
 * SeedPitchesPanel — admin control for past-winner videos that seed the
 * gallery before real submissions arrive. Sits in the Pitches tab under
 * the main pitch list.
 *
 * Includes:
 *   • A toggle that hides all seed pitches from the gallery in one flip
 *     (backed by competition_settings.seeds_visible).
 *   • An uploader that mints a Mux direct-upload URL and PUTs the file
 *     straight to Mux — same pattern as the participant intake form.
 *   • A grid of existing seed pitches with delete.
 */
export default function SeedPitchesPanel({ apiFetch, onError, onSuccess }) {
  const [pitches, setPitches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seedsVisible, setSeedsVisible] = useState(true);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const [form, setForm] = useState({ title: "", name: "", description: "" });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const loadPitches = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/seed-pitches");
      setPitches(Array.isArray(data?.pitches) ? data.pitches : []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVisibility = async () => {
    try {
      const data = await apiFetch("/api/admin/competition-date");
      // Undefined column defaults to true (pre-migration).
      setSeedsVisible(data?.seeds_visible !== false);
    } catch {
      // Non-fatal — leave the toggle in its default position.
    }
  };

  useEffect(() => {
    loadPitches();
    loadVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleVisibility = async () => {
    const next = !seedsVisible;
    setTogglingVisibility(true);
    // Optimistic — the API returns after a round-trip, but the UI feels
    // snappier if the switch moves right away.
    setSeedsVisible(next);
    try {
      await apiFetch("/api/admin/competition-date", {
        method: "POST",
        body: JSON.stringify({ seeds_visible: next }),
      });
      onSuccess?.(
        next
          ? "Seed pitches are now visible in the gallery."
          : "Seed pitches are hidden from the gallery."
      );
    } catch (err) {
      setSeedsVisible(!next);
      onError?.(err.message);
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleFilePick = (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (!VIDEO_TYPES.includes(picked.type)) {
      onError?.("Only MP4, MOV, or WebM video files are supported.");
      e.target.value = "";
      return;
    }
    if (picked.size > MAX_SIZE) {
      onError?.("File must be under 500MB.");
      e.target.value = "";
      return;
    }
    setFile(picked);
  };

  const uploadToMux = (uploadUrl, video) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", video.type || "application/octet-stream");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Mux upload failed (status ${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("Network error during Mux upload."));
      xhr.send(video);
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      onError?.("Please choose a video file.");
      return;
    }
    if (!form.title.trim() || !form.name.trim()) {
      onError?.("Title and submitter name are required.");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const { pitchId, uploadUrl } = await apiFetch("/api/admin/seed-pitches", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
        }),
      });
      if (!uploadUrl) throw new Error("Server did not return a Mux upload URL.");
      await uploadToMux(uploadUrl, file);
      onSuccess?.(`Seed pitch "${form.title.trim()}" uploaded. Mux is now processing.`);
      // Reset form
      setForm({ title: "", name: "", description: "" });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadProgress(0);
      // Optimistic insert until the webhook lands
      setPitches((prev) => [
        {
          id: pitchId,
          title: form.title.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          mux_status: "processing",
          mux_playback_id: null,
          mux_asset_id: null,
          mux_error: null,
          created_at: new Date().toISOString(),
          is_seed: true,
        },
        ...prev,
      ]);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (pitch) => {
    if (!confirm(`Remove seed pitch "${pitch.title}"? This deletes the Mux asset too.`)) return;
    setDeletingId(pitch.id);
    try {
      await apiFetch(`/api/admin/seed-pitches?id=${pitch.id}`, { method: "DELETE" });
      setPitches((prev) => prev.filter((p) => p.id !== pitch.id));
      onSuccess?.("Seed pitch removed.");
    } catch (err) {
      onError?.(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <GlassCard>
      {/* Header + visibility toggle */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="#FFCB05" viewBox="0 0 24 24">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
            <h2 className="text-lg font-bold text-white">Past-Winner Seed Pitches</h2>
          </div>
          <p className="text-xs text-white/40 mt-0.5">
            Video-only pitches from past competitions. They skip moderation and
            appear in the gallery with a crown badge until you flip the switch
            off (usually once enough real submissions arrive).
          </p>
        </div>

        {/* Toggle */}
        <label
          className="flex items-center gap-2.5 cursor-pointer flex-shrink-0"
          title="Show seed pitches in the public gallery"
        >
          <span className="text-xs text-white/60 whitespace-nowrap">
            Show in gallery
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={seedsVisible}
            onClick={handleToggleVisibility}
            disabled={togglingVisibility}
            className="relative w-10 h-6 rounded-full transition-colors disabled:opacity-50"
            style={{
              background: seedsVisible ? "#FFCB05" : "rgba(255,255,255,0.15)",
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
              style={{
                background: seedsVisible ? "#0B1A3B" : "#e5e5e5",
                transform: seedsVisible ? "translateX(16px)" : "translateX(0)",
              }}
            />
          </button>
        </label>
      </div>

      {/* Upload form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl p-4 mb-4 space-y-3"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Pitch title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              disabled={uploading}
              required
              placeholder="Ann Arbor Aquaponics"
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Submitter name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={uploading}
              required
              placeholder="Jane Doe · 2025 Grand Prize"
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Description (optional)
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            disabled={uploading}
            rows={2}
            placeholder="Short blurb shown on the pitch detail card."
            className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize resize-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
            Video file
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              onChange={handleFilePick}
              disabled={uploading}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white/80 hover:text-white transition-colors disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {file ? "Change file" : "Choose video"}
            </button>
            <div className="min-w-0 flex-1 text-xs text-white/50 truncate">
              {file ? (
                <>
                  {file.name}{" "}
                  <span className="text-white/25">
                    · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </>
              ) : (
                "MP4, MOV, or WebM · max 500MB"
              )}
            </div>
          </div>
        </div>

        {uploading && (
          <div>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div
                className="h-full transition-all"
                style={{ width: `${uploadProgress}%`, background: "#FFCB05" }}
              />
            </div>
            <p className="text-[11px] text-white/40 mt-1.5">
              Uploading to Mux — {uploadProgress}%
            </p>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={uploading || !file || !form.title.trim() || !form.name.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
            style={{ background: "#FFCB05" }}
          >
            {uploading ? "Uploading..." : "Upload seed pitch"}
          </button>
        </div>
      </form>

      {/* Existing seed pitches */}
      {loading ? (
        <p className="text-white/40 text-sm">Loading seed pitches...</p>
      ) : pitches.length === 0 ? (
        <div
          className="rounded-xl py-6 px-4 text-center"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px dashed rgba(255,255,255,0.1)",
          }}
        >
          <p className="text-sm text-white/50">No seed pitches yet.</p>
          <p className="text-xs text-white/30 mt-1">
            Upload past-winner videos above to prime the gallery.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pitches.map((pitch) => {
            const s = statusLabel(pitch);
            const thumb = pitch.mux_playback_id
              ? `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1&width=480&fit_mode=smartcrop`
              : null;
            return (
              <div
                key={pitch.id}
                className="rounded-xl overflow-hidden flex flex-col"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="w-full aspect-video flex items-center justify-center relative"
                  style={{ background: "rgba(0,0,0,0.35)" }}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={pitch.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/40">
                      <svg
                        className="animate-spin h-5 w-5 text-maize"
                        viewBox="0 0 24 24"
                      >
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
                      <span className="text-[10px] uppercase tracking-wider">
                        {pitch.mux_error ? "Errored" : "Processing"}
                      </span>
                    </div>
                  )}
                  <span
                    className="absolute top-2 left-2 text-[9px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded"
                    style={{ background: s.color, color: "#0B1A3B" }}
                  >
                    {s.label}
                  </span>
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <p className="text-sm font-semibold text-white truncate">
                    {pitch.title}
                  </p>
                  <p className="text-xs text-white/40 truncate">{pitch.name}</p>
                  {pitch.mux_error && (
                    <p className="text-[11px] text-red-300/80 mt-1 line-clamp-2">
                      {pitch.mux_error}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(pitch)}
                    disabled={deletingId === pitch.id}
                    className="mt-3 self-start px-3 py-1 rounded-md text-[11px] font-semibold text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                    }}
                  >
                    {deletingId === pitch.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
