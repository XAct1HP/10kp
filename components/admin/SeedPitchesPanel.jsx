"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
// Sentinel value in the award <select> that reveals the "create new" input.
const NEW_AWARD_VALUE = "__new__";

// Default competition year = last calendar year — admins usually upload
// winners after the competition closes, so "this year" would be wrong.
function defaultWinnerYear() {
  return new Date().getFullYear() - 1;
}

function statusLabel(pitch) {
  if (pitch.mux_playback_id) return { label: "Ready", color: "#4ade80" };
  if (pitch.mux_error) return { label: "Error", color: "#f87171" };
  return { label: pitch.mux_status || "Processing", color: "#fbbf24" };
}

function awardNameFor(pitch, awardsById) {
  if (pitch.winner_award?.name) return pitch.winner_award.name;
  if (pitch.winner_award_id && awardsById.has(pitch.winner_award_id)) {
    return awardsById.get(pitch.winner_award_id).name;
  }
  return null;
}

function awardSortOrder(pitch, awardsById) {
  if (pitch.winner_award?.sort_order != null) return pitch.winner_award.sort_order;
  if (pitch.winner_award_id && awardsById.has(pitch.winner_award_id)) {
    return awardsById.get(pitch.winner_award_id).sort_order ?? Infinity;
  }
  return Infinity;
}

function sortWinners(list, awardsById) {
  // Year desc → award sort_order asc (nulls last) → created_at desc.
  return [...list].sort((a, b) => {
    const ay = a.winner_year ?? -Infinity;
    const by = b.winner_year ?? -Infinity;
    if (ay !== by) return by - ay;
    const ao = awardSortOrder(a, awardsById);
    const bo = awardSortOrder(b, awardsById);
    if (ao !== bo) return ao - bo;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
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
 *   • Competition year + award category so the gallery Winners lane can
 *     group and badge them correctly (vote_count is always 0 for seeds).
 *   • A grid of existing winners with inline year/award edit + delete.
 */
export default function SeedPitchesPanel({ apiFetch, onError, onSuccess, embedded = false }) {
  const [pitches, setPitches] = useState([]);
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [winnerMetaReady, setWinnerMetaReady] = useState(true);
  const [seedsVisible, setSeedsVisible] = useState(true);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const [form, setForm] = useState({
    title: "",
    name: "",
    description: "",
    winnerYear: String(defaultWinnerYear()),
    awardId: "",
    newAwardName: "",
  });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    winnerYear: "",
    awardId: "",
    newAwardName: "",
  });
  const [savingId, setSavingId] = useState(null);
  const fileInputRef = useRef(null);

  const awardsById = useMemo(() => {
    const map = new Map();
    for (const award of awards) {
      if (award?.id) map.set(award.id, award);
    }
    return map;
  }, [awards]);

  const activeAwards = useMemo(
    () => awards.filter((a) => a.is_active !== false),
    [awards]
  );

  const sortedPitches = useMemo(
    () => sortWinners(pitches, awardsById),
    [pitches, awardsById]
  );

  const loadPitches = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/seed-pitches");
      setPitches(Array.isArray(data?.pitches) ? data.pitches : []);
      setWinnerMetaReady(data?.winnerMetaReady !== false);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAwards = async () => {
    try {
      const data = await apiFetch("/api/admin/awards");
      setAwards(Array.isArray(data) ? data : []);
    } catch {
      // Non-fatal — award select stays empty until awards load.
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
    loadAwards();
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
          ? "Past winners are now visible in the gallery."
          : "Past winners are hidden from the gallery."
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

  // Resolve the selected award: either an existing id, or create one from
  // the "new category" name via the awards API and return its id.
  const resolveAwardId = async (awardId, newAwardName) => {
    if (awardId !== NEW_AWARD_VALUE) {
      return { awardId: awardId?.trim() || null, created: null };
    }
    const name = (newAwardName || "").trim();
    if (!name) {
      throw new Error("Enter a name for the new award category.");
    }
    // Reuse an existing award with the same name (case-insensitive) so
    // admins don't accidentally create duplicates from this shortcut.
    const existing = awards.find(
      (a) => (a.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      return { awardId: existing.id, created: existing };
    }
    const created = await apiFetch("/api/admin/awards", {
      method: "POST",
      body: JSON.stringify({ name, is_active: true }),
    });
    if (!created?.id) throw new Error("Failed to create award category.");
    setAwards((prev) => [...prev, created]);
    return { awardId: created.id, created };
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

    const yearRaw = form.winnerYear.trim();
    let winnerYear = null;
    if (yearRaw) {
      const n = Number(yearRaw);
      if (!Number.isInteger(n) || n < 1900 || n > 2200) {
        onError?.("Competition year must be an integer between 1900 and 2200.");
        return;
      }
      winnerYear = n;
    }

    const awardId = form.awardId.trim() || null;

    setUploading(true);
    setUploadProgress(0);
    const submittedTitle = form.title.trim();
    const submittedName = form.name.trim();
    const submittedDescription = form.description.trim() || null;
    try {
      const resolved = await resolveAwardId(form.awardId, form.newAwardName);
      const { pitchId, uploadUrl } = await apiFetch("/api/admin/seed-pitches", {
        method: "POST",
        body: JSON.stringify({
          title: submittedTitle,
          name: submittedName,
          description: submittedDescription,
          winnerYear,
          awardId: resolved.awardId,
        }),
      });
      if (!uploadUrl) throw new Error("Server did not return a Mux upload URL.");
      await uploadToMux(uploadUrl, file);
      onSuccess?.(`Past winner "${submittedTitle}" uploaded. Mux is now processing.`);
      // Sticky year across batch uploads; clear everything else.
      setForm((prev) => ({
        title: "",
        name: "",
        description: "",
        winnerYear: prev.winnerYear,
        awardId: "",
        newAwardName: "",
      }));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadProgress(0);
      const nestedAward =
        resolved.created ||
        (resolved.awardId ? awardsById.get(resolved.awardId) || null : null);
      // Optimistic insert until the webhook lands
      setPitches((prev) => [
        {
          id: pitchId,
          title: submittedTitle,
          name: submittedName,
          description: submittedDescription,
          winner_year: winnerYear,
          winner_award_id: resolved.awardId,
          winner_award: nestedAward
            ? { id: nestedAward.id, name: nestedAward.name, sort_order: nestedAward.sort_order }
            : null,
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
    if (!confirm(`Remove past winner "${pitch.title}"? This deletes the Mux asset too.`)) return;
    setDeletingId(pitch.id);
    try {
      await apiFetch(`/api/admin/seed-pitches?id=${pitch.id}`, { method: "DELETE" });
      setPitches((prev) => prev.filter((p) => p.id !== pitch.id));
      if (editingId === pitch.id) setEditingId(null);
      onSuccess?.("Past winner removed.");
    } catch (err) {
      onError?.(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (pitch) => {
    setEditingId(pitch.id);
    setEditDraft({
      winnerYear: pitch.winner_year != null ? String(pitch.winner_year) : "",
      awardId: pitch.winner_award_id || "",
      newAwardName: "",
    });
  };

  const handleSaveEdit = async (pitch) => {
    const yearRaw = editDraft.winnerYear.trim();
    let winnerYear = null;
    if (yearRaw) {
      const n = Number(yearRaw);
      if (!Number.isInteger(n) || n < 1900 || n > 2200) {
        onError?.("Competition year must be an integer between 1900 and 2200.");
        return;
      }
      winnerYear = n;
    }

    setSavingId(pitch.id);
    try {
      const resolved = await resolveAwardId(editDraft.awardId, editDraft.newAwardName);
      const data = await apiFetch("/api/admin/seed-pitches", {
        method: "PATCH",
        body: JSON.stringify({
          id: pitch.id,
          winnerYear,
          awardId: resolved.awardId,
        }),
      });
      const updated = data?.pitch;
      const nestedAward =
        updated?.winner_award ||
        resolved.created ||
        (resolved.awardId
          ? (() => {
              const a = awardsById.get(resolved.awardId);
              return a
                ? { id: a.id, name: a.name, sort_order: a.sort_order }
                : null;
            })()
          : null);
      setPitches((prev) =>
        prev.map((p) =>
          p.id === pitch.id
            ? {
                ...p,
                ...(updated || {}),
                winner_year: updated?.winner_year ?? winnerYear,
                winner_award_id: updated?.winner_award_id ?? resolved.awardId,
                winner_award: nestedAward,
              }
            : p
        )
      );
      setEditingId(null);
      onSuccess?.(`Updated year/award category for "${pitch.title}".`);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <GlassCard>
      {/* Header + visibility toggle */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          {embedded ? (
            <h2 className="text-lg font-bold text-white">
              Upload and manage last year&apos;s winners
            </h2>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="#FFCB05" viewBox="0 0 24 24">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                </svg>
                <h2 className="text-lg font-bold text-white">Last Year&apos;s Winners</h2>
              </div>
              <p className="text-xs text-white/40 mt-0.5">
                Upload past competition winners with their year and award
                category. They skip moderation, appear in the gallery Winners
                lane, and can&apos;t be voted on. Award category drives the
                gallery badge. Flip the switch off once enough real submissions
                arrive.
              </p>
            </>
          )}
        </div>

        {/* Toggle */}
        <label
          className="flex items-center gap-2.5 cursor-pointer flex-shrink-0"
          title="Show past winners in the public gallery"
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

      {!winnerMetaReady && (
        <div
          className="rounded-xl px-3.5 py-2.5 mb-4 text-xs"
          style={{
            background: "rgba(251,191,36,0.12)",
            border: "1px solid rgba(251,191,36,0.35)",
            color: "#fbbf24",
          }}
        >
          Winner year/award columns aren&apos;t in the database yet. Run{" "}
          <code className="text-[11px]">migrations/20260818_add_winner_metadata.sql</code>{" "}
          (and{" "}
          <code className="text-[11px]">migrations/20260819_winner_award_category.sql</code>{" "}
          if needed) to enable sorting and editing. Uploads still work —
          year/award will apply after the migration.
        </div>
      )}

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
              placeholder="Jane Doe"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Competition year
            </label>
            <input
              type="number"
              min={1900}
              max={2200}
              value={form.winnerYear}
              onChange={(e) => setForm({ ...form, winnerYear: e.target.value })}
              disabled={uploading}
              placeholder={String(defaultWinnerYear())}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Award category (optional)
            </label>
            <select
              value={form.awardId}
              onChange={(e) =>
                setForm({
                  ...form,
                  awardId: e.target.value,
                  newAwardName:
                    e.target.value === NEW_AWARD_VALUE ? form.newAwardName : "",
                })
              }
              disabled={uploading || !winnerMetaReady}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white focus:outline-none focus:border-maize"
              style={inputStyle}
            >
              <option value="">None</option>
              {activeAwards.map((award) => (
                <option key={award.id} value={award.id}>
                  {award.name}
                </option>
              ))}
              <option value={NEW_AWARD_VALUE}>+ Add new category…</option>
            </select>
            {form.awardId === NEW_AWARD_VALUE && (
              <input
                type="text"
                value={form.newAwardName}
                onChange={(e) =>
                  setForm({ ...form, newAwardName: e.target.value })
                }
                disabled={uploading}
                required
                placeholder="e.g. Grand Prize, Audience Choice"
                className="w-full mt-2 px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                style={inputStyle}
              />
            )}
            <p className="text-[10px] text-white/25 mt-1">
              New categories are added to Settings → Awards as well.
            </p>
          </div>
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
            {uploading ? "Uploading..." : "Upload past winner"}
          </button>
        </div>
      </form>

      {/* Existing winners */}
      {loading ? (
        <p className="text-white/40 text-sm">Loading past winners...</p>
      ) : sortedPitches.length === 0 ? (
        <div
          className="rounded-xl py-6 px-4 text-center"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px dashed rgba(255,255,255,0.1)",
          }}
        >
          <p className="text-sm text-white/50">No past winners yet.</p>
          <p className="text-xs text-white/30 mt-1">
            Upload winner videos above to prime the gallery Winners lane.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {sortedPitches.map((pitch) => {
            const s = statusLabel(pitch);
            const awardLabel = awardNameFor(pitch, awardsById);
            // Match the 120×68 display box at 2× dpi (16:9).
            const thumb = pitch.mux_playback_id
              ? `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1&width=240&height=135&fit_mode=smartcrop`
              : null;
            const isEditing = editingId === pitch.id;
            return (
              <div
                key={pitch.id}
                className="rounded-xl flex items-center gap-3 p-2.5"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {/* Fixed 16:9 box — image is absolutely inset so it always
                    scales to fill without overflowing. */}
                <div
                  className="relative w-[120px] h-[68px] flex-shrink-0 rounded-md overflow-hidden"
                  style={{ background: "rgba(0,0,0,0.35)" }}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={pitch.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <svg
                      className="absolute inset-0 m-auto animate-spin h-4 w-4 text-maize"
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
                  )}
                  <span
                    className="absolute top-1 left-1 text-[8px] uppercase tracking-wider font-black px-1 py-px rounded"
                    style={{ background: s.color, color: "#0B1A3B" }}
                  >
                    {s.label}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {pitch.title}
                  </p>
                  <p className="text-xs text-white/40 truncate">{pitch.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {pitch.winner_year != null && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          background: "rgba(255,203,5,0.15)",
                          color: "#FFCB05",
                          border: "1px solid rgba(255,203,5,0.25)",
                        }}
                      >
                        {pitch.winner_year}
                      </span>
                    )}
                    {awardLabel && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white/70 truncate max-w-[140px]"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.12)",
                        }}
                        title={awardLabel}
                      >
                        {awardLabel}
                      </span>
                    )}
                  </div>
                  {pitch.mux_error && (
                    <p className="text-[11px] text-red-300/80 mt-0.5 line-clamp-1">
                      {pitch.mux_error}
                    </p>
                  )}

                  {isEditing && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-white/35 mb-1">
                          Year
                        </label>
                        <input
                          type="number"
                          min={1900}
                          max={2200}
                          value={editDraft.winnerYear}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, winnerYear: e.target.value })
                          }
                          disabled={savingId === pitch.id}
                          className="w-[88px] px-2 py-1.5 rounded-md text-xs text-white focus:outline-none"
                          style={inputStyle}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="block text-[10px] uppercase tracking-wider text-white/35 mb-1">
                          Award category
                        </label>
                        <select
                          value={editDraft.awardId}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              awardId: e.target.value,
                              newAwardName:
                                e.target.value === NEW_AWARD_VALUE
                                  ? editDraft.newAwardName
                                  : "",
                            })
                          }
                          disabled={savingId === pitch.id}
                          className="w-full min-w-[140px] px-2 py-1.5 rounded-md text-xs text-white focus:outline-none"
                          style={inputStyle}
                        >
                          <option value="">None</option>
                          {activeAwards.map((award) => (
                            <option key={award.id} value={award.id}>
                              {award.name}
                            </option>
                          ))}
                          <option value={NEW_AWARD_VALUE}>+ Add new category…</option>
                        </select>
                        {editDraft.awardId === NEW_AWARD_VALUE && (
                          <input
                            type="text"
                            value={editDraft.newAwardName}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                newAwardName: e.target.value,
                              })
                            }
                            disabled={savingId === pitch.id}
                            placeholder="New category name"
                            className="w-full mt-1.5 px-2 py-1.5 rounded-md text-xs text-white placeholder-white/25 focus:outline-none"
                            style={inputStyle}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(pitch)}
                        disabled={savingId === pitch.id}
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-black disabled:opacity-40"
                        style={{ background: "#FFCB05" }}
                      >
                        {savingId === pitch.id ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={savingId === pitch.id}
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-white/60 hover:text-white/80 disabled:opacity-40"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(pitch)}
                    disabled={!winnerMetaReady || isEditing}
                    aria-label="Edit year and award category"
                    title={
                      winnerMetaReady
                        ? "Edit year / award category"
                        : "Run winner metadata migration first"
                    }
                    className="w-7 h-7 rounded-md flex items-center justify-center text-white/55 hover:text-white transition-colors disabled:opacity-30"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.232 5.232l3.536 3.536M4 20h4.586a1 1 0 00.707-.293l9.414-9.414a2 2 0 000-2.828l-2.172-2.172a2 2 0 00-2.828 0L4.293 14.707A1 1 0 004 15.414V20z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(pitch)}
                    disabled={deletingId === pitch.id}
                    aria-label="Remove past winner"
                    title="Remove"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                    }}
                  >
                    {deletingId === pitch.id ? (
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
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
                    ) : (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                        />
                      </svg>
                    )}
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
