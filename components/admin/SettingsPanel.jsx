"use client";

import { useEffect, useState } from "react";
import SponsorsPanel from "./SponsorsPanel";
import AwardsPanel from "./AwardsPanel";
import AdminUsersPanel from "./AdminUsersPanel";

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

function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local) {
  if (!local) return null;
  const d = new Date(local);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function formatDate(iso) {
  if (!iso) return "Not set";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

/**
 * SettingsPanel — competition dates + sponsors + awards + default thumbnails.
 *
 * Awards here are create/edit/delete only. Winner recording moves to the
 * Announcements tab so award creation stays a config-only concern.
 *
 * Props:
 *   apiFetch, apiUpload: (url, ...) => Promise
 *   onError, onSuccess: (msg) => void
 *   defaultThumbnails: { audio: string|null, text: string|null }
 *   uploadingThumbnail: 'audio' | 'text' | null
 *   onUploadDefaultThumbnail: (type: 'audio'|'text', file: File) => void
 */
export default function SettingsPanel({
  apiFetch,
  apiUpload,
  onError,
  onSuccess,
  defaultThumbnails = { audio: null, text: null },
  uploadingThumbnail = null,
  onUploadDefaultThumbnail,
}) {
  const [loading, setLoading] = useState(true);
  const [competitionDate, setCompetitionDate] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [savingDates, setSavingDates] = useState(false);
  const [datesDirty, setDatesDirty] = useState(false);

  const loadDates = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/competition-date");
      setCompetitionDate(isoToLocalInput(data?.competition_date));
      setSubmissionDeadline(isoToLocalInput(data?.submission_deadline));
      setDatesDirty(false);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDates(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const saveDates = async () => {
    setSavingDates(true);
    try {
      await apiFetch("/api/admin/competition-date", {
        method: "POST",
        body: JSON.stringify({
          competition_date: localInputToIso(competitionDate),
          submission_deadline: localInputToIso(submissionDeadline),
        }),
      });
      onSuccess?.("Competition dates saved");
      setDatesDirty(false);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSavingDates(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto no-scrollbar pr-1">
      {/* Competition dates */}
      <GlassCard>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Competition Dates</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Home page shows a countdown to the start, then switches to a countdown to the submission deadline.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-white/40 text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                Competition start
              </label>
              <input
                type="datetime-local"
                value={competitionDate}
                onChange={(e) => { setCompetitionDate(e.target.value); setDatesDirty(true); }}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white focus:outline-none focus:border-maize"
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
              <p className="text-[10px] text-white/30 mt-1">
                Currently: <span className="text-white/60">{formatDate(localInputToIso(competitionDate))}</span>
              </p>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                Submission deadline
              </label>
              <input
                type="datetime-local"
                value={submissionDeadline}
                onChange={(e) => { setSubmissionDeadline(e.target.value); setDatesDirty(true); }}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white focus:outline-none focus:border-maize"
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
              <p className="text-[10px] text-white/30 mt-1">
                Currently: <span className="text-white/60">{formatDate(localInputToIso(submissionDeadline))}</span>
              </p>
            </div>
          </div>
        )}

        {datesDirty && (
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={loadDates}
              disabled={savingDates}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white transition-colors disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={saveDates}
              disabled={savingDates}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
              style={{ background: "#FFCB05" }}
            >
              {savingDates ? "Saving..." : "Save dates"}
            </button>
          </div>
        )}
      </GlassCard>

      {/* Default thumbnails — compact row; two small preview chips side by side */}
      <GlassCard>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <div>
            <h2 className="text-base font-bold text-white">Default Thumbnails</h2>
            <p className="text-[11px] text-white/40 mt-0.5">Fallback images for audio and text pitches.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { type: "audio", label: "Audio" },
            { type: "text", label: "Text" },
          ].map(({ type, label }) => (
            <div
              key={type}
              className="flex items-center gap-3 rounded-lg p-2 pr-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {defaultThumbnails[type] ? (
                <div className="relative group w-28 h-16 rounded-md overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={defaultThumbnails[type]} alt={label} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <label className="px-2 py-1 rounded text-[10px] font-semibold text-white bg-white/25 hover:bg-white/35 cursor-pointer transition-colors">
                      Replace
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => onUploadDefaultThumbnail?.(type, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label
                  className="flex items-center justify-center w-28 h-16 rounded-md cursor-pointer transition-colors hover:bg-white/[0.03] flex-shrink-0"
                  style={{ border: "1.5px dashed rgba(255,255,255,0.12)" }}
                >
                  {uploadingThumbnail === type ? (
                    <svg className="animate-spin h-4 w-4 text-maize" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <span className="text-[10px] text-white/35">Upload</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => onUploadDefaultThumbnail?.(type, e.target.files?.[0])}
                  />
                </label>
              )}
              <p className="text-xs font-semibold text-white/70">{label}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Administrators */}
      <div>
        <AdminUsersPanel
          apiFetch={apiFetch}
          onError={onError}
          onSuccess={onSuccess}
        />
      </div>

      {/* Sponsors */}
      <div>
        <SponsorsPanel
          apiFetch={apiFetch}
          apiUpload={apiUpload}
          onError={onError}
          onSuccess={onSuccess}
        />
      </div>

      {/* Awards */}
      <div>
        <AwardsPanel
          apiFetch={apiFetch}
          onError={onError}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}
