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

// Small icon-only action button so the list cards stay logo-focused.
function IconButton({ onClick, disabled, label, danger, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-40"
      style={{
        color: danger ? "rgba(252,165,165,0.85)" : "rgba(255,255,255,0.55)",
        background: danger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${danger ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)"}`,
      }}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
    </svg>
  );
}

/**
 * SponsorsPanel — CRUD for sponsoring departments/orgs.
 *
 * Wrapped in a single GlassCard so it visually matches Competition
 * Dates / Default Thumbnails / Administrators. Item tiles are
 * fixed-height so they line up with the Awards tiles below.
 */
export default function SponsorsPanel({ apiFetch, apiUpload, onError, onSuccess }) {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    website: "",
    sort_order: 0,
    logo_path: null,
    logo_url: null,
    light_background: false,
    size_multiplier: 1,
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/sponsors");
      setSponsors(data || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const resetForm = () => {
    setForm({
      name: "",
      website: "",
      sort_order: 0,
      logo_path: null,
      logo_url: null,
      light_background: false,
      size_multiplier: 1,
    });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (sponsor) => {
    setEditing(sponsor);
    setForm({
      name: sponsor.name || "",
      website: sponsor.website || "",
      sort_order: sponsor.sort_order || 0,
      logo_path: sponsor.logo_path || null,
      logo_url: sponsor.logo_url || null,
      light_background: Boolean(sponsor.light_background),
      size_multiplier: Number(sponsor.size_multiplier ?? 1) || 1,
    });
    setShowForm(true);
  };

  const handleLogoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload("/api/admin/sponsors/upload-logo", fd);
      setForm((f) => ({ ...f, logo_path: res.logo_path, logo_url: res.logo_url }));
    } catch (err) {
      onError?.(err.message);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        website: form.website.trim() || null,
        logo_path: form.logo_path || null,
        sort_order: Number(form.sort_order) || 0,
        light_background: Boolean(form.light_background),
        size_multiplier: Number(form.size_multiplier) > 0 ? Number(form.size_multiplier) : 1,
      };
      if (editing) {
        await apiFetch("/api/admin/sponsors", {
          method: "PUT",
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
        onSuccess?.("Sponsor updated");
      } else {
        await apiFetch("/api/admin/sponsors", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onSuccess?.("Sponsor added");
      }
      resetForm();
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (sponsor) => {
    if (!confirm(`Delete sponsor "${sponsor.name}"? This will also remove it from any awards.`)) return;
    setDeletingId(sponsor.id);
    try {
      await apiFetch(`/api/admin/sponsors?id=${sponsor.id}`, { method: "DELETE" });
      onSuccess?.("Sponsor removed");
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Sponsors</h2>
          <p className="text-xs text-white/40 mt-0.5">
            Departments and orgs that sponsor awards or events. Logos appear on the Rules page and in announcements.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 flex-shrink-0"
            style={{ background: "#FFCB05" }}
          >
            + Add sponsor
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-white">
                {editing ? "Edit sponsor" : "New sponsor"}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Logo picker */}
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Logo</label>
                <div
                  className="w-full aspect-square rounded-xl flex items-center justify-center overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.15)" }}
                >
                  {form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="Sponsor logo" className="max-w-full max-h-full object-contain p-3" />
                  ) : (
                    <span className="text-xs text-white/30">No logo yet</span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  onChange={handleLogoPick}
                  className="hidden"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white/80 hover:text-white transition-colors disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    {uploadingLogo ? "Uploading..." : form.logo_path ? "Replace" : "Upload"}
                  </button>
                  {form.logo_path && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, logo_path: null, logo_url: null }))}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 transition-colors"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-white/30">PNG, JPG, WebP, SVG, or GIF. Max 3MB.</p>
              </div>

              {/* Text fields */}
              <div className="md:col-span-2 space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="Zell Lurie Institute"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Website (optional)</label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://zli.umich.edu"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                    style={inputStyle}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Sort order</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                      style={inputStyle}
                    />
                    <p className="mt-1 text-[10px] text-white/30">Lower numbers appear first.</p>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                      Size multiplier
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      max="5"
                      step="0.05"
                      value={form.size_multiplier}
                      onChange={(e) => setForm({ ...form, size_multiplier: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
                      style={inputStyle}
                    />
                    <p className="mt-1 text-[10px] text-white/30">1.0 = default. 0.8 shrinks, 1.3 grows.</p>
                  </div>
                </div>

                {/* Light-background toggle */}
                <label
                  className="flex items-start gap-3 cursor-pointer rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <input
                    type="checkbox"
                    checked={form.light_background}
                    onChange={(e) => setForm({ ...form, light_background: e.target.checked })}
                    className="mt-0.5 accent-maize"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">Use light background</p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      Turn on when this sponsor&apos;s logo has dark artwork that won&apos;t read on the navy disk.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || uploadingLogo || !form.name.trim()}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                style={{ background: "#FFCB05" }}
              >
                {submitting ? "Saving..." : editing ? "Save changes" : "Add sponsor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-white/40 text-sm">Loading sponsors...</p>
      ) : sponsors.length === 0 ? (
        <div
          className="rounded-xl py-8 px-4 text-center"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}
        >
          <p className="text-sm text-white/50">No sponsors yet.</p>
          <p className="text-xs text-white/30 mt-1">Add one above to attach it to awards and events.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {sponsors.map((sponsor) => (
            <div
              key={sponsor.id}
              className="relative rounded-xl p-3 flex flex-col h-44"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Actions — small icons top-right */}
              <div className="absolute top-2 right-2 flex gap-1">
                <IconButton onClick={() => startEdit(sponsor)} label="Edit sponsor">
                  <PencilIcon />
                </IconButton>
                <IconButton
                  onClick={() => handleDelete(sponsor)}
                  disabled={deletingId === sponsor.id}
                  label="Delete sponsor"
                  danger
                >
                  <TrashIcon />
                </IconButton>
              </div>

              {/* Logo — dominant */}
              <div className="flex-1 min-h-0 flex items-center justify-center px-2 pt-2 pb-1">
                {sponsor.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sponsor.logo_url}
                    alt={sponsor.name}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-[11px] text-white/25 uppercase tracking-wider">No logo</span>
                )}
              </div>

              {/* Small caption */}
              <p className="text-[11px] text-white/60 text-center truncate mt-1">{sponsor.name}</p>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
