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
 * SettingsPanel — competition dates + sponsors + awards.
 *
 * Awards here are create/edit/delete only. Winner recording moves to the
 * Announcements tab so award creation stays a config-only concern.
 *
 * Props:
 *   apiFetch, apiUpload: (url, ...) => Promise
 *   onError, onSuccess: (msg) => void
 */
export default function SettingsPanel({ apiFetch, apiUpload, onError, onSuccess }) {
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
