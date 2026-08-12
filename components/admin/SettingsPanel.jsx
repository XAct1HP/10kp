"use client";

import { useEffect, useState } from "react";
import SponsorsPanel from "./SponsorsPanel";
import AwardsPanel from "./AwardsPanel";

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

      {/* Default thumbnails */}
      <GlassCard>
        <h2 className="text-lg font-bold text-white mb-1">Default Thumbnails</h2>
        <p className="text-sm text-white/35 mb-5">Fallback images for audio and text pitches.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            { type: "audio", label: "Audio Pitch" },
            { type: "text", label: "Text Pitch" },
          ].map(({ type, label }) => (
            <div key={type}>
              <p className="text-sm font-semibold text-white/60 mb-2">{label}</p>
              {defaultThumbnails[type] ? (
                <div className="relative group rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={defaultThumbnails[type]} alt={label} className="w-full aspect-video object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <label className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/20 hover:bg-white/30 cursor-pointer transition-colors">
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
                  className="flex flex-col items-center justify-center w-full aspect-video rounded-xl cursor-pointer transition-colors hover:bg-white/[0.03]"
                  style={{ border: "2px dashed rgba(255,255,255,0.08)" }}
                >
                  {uploadingThumbnail === type ? (
                    <svg className="animate-spin h-5 w-5 text-maize" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <>
                      <svg className="w-7 h-7 text-white/15 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-white/25">Upload image</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => onUploadDefaultThumbnail?.(type, e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

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
