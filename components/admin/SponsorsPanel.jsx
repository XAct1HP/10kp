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

/**
 * SponsorsPanel — CRUD for sponsoring departments/orgs.
 *
 * Props:
 *   apiFetch: (url, opts?) => Promise — authenticated JSON fetch (admin page's helper)
 *   apiUpload: (url, FormData) => Promise — authenticated multipart upload helper
 *   onError, onSuccess: (msg: string) => void — bubble notifications up
 */
export default function SponsorsPanel({ apiFetch, apiUpload, onError, onSuccess }) {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // sponsor being edited or null
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", sort_order: 0, logo_path: null, logo_url: null });
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
    setForm({ name: "", website: "", sort_order: 0, logo_path: null, logo_url: null });
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
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto no-scrollbar pr-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">Sponsors</h2>
          <p className="text-xs text-white/40 mt-0.5">
            Departments and orgs that sponsor awards or events. Logos appear on the Rules page and in announcements.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
            style={{ background: "#FFCB05" }}
          >
            + Add Sponsor
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <GlassCard>
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
        </GlassCard>
      )}

      {/* List */}
      {loading ? (
        <GlassCard>
          <div className="py-8 text-center text-sm text-white/40">Loading sponsors...</div>
        </GlassCard>
      ) : sponsors.length === 0 ? (
        <GlassCard>
          <div className="py-8 text-center">
            <p className="text-sm text-white/50">No sponsors yet.</p>
            <p className="text-xs text-white/30 mt-1">Add one above to attach it to awards and events.</p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sponsors.map((sponsor) => (
            <GlassCard key={sponsor.id} className="!p-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  {sponsor.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sponsor.logo_url} alt={sponsor.name} className="max-w-full max-h-full object-contain p-1.5" />
                  ) : (
                    <span className="text-[10px] text-white/30 uppercase">No logo</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{sponsor.name}</p>
                  {sponsor.website && (
                    <a
                      href={sponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-white/40 hover:text-maize truncate block"
                    >
                      {sponsor.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => startEdit(sponsor)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(sponsor)}
                  disabled={deletingId === sponsor.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  {deletingId === sponsor.id ? "..." : "Delete"}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
