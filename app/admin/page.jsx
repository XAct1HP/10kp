"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../../lib/AuthContext";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { buildAccountCsv, joinEmailList, parseEmailList, WINNER_SURVEY_URL } from "../../lib/outreach";
import { buildPitchCsv } from "../../lib/pitchExport";
import MuxPlayer from "@mux/mux-player-react";
import PageBackground from "../../components/PageBackground";
import adminBg from "../../public/admin_bg.png";
import SettingsPanel from "../../components/admin/SettingsPanel";
import AnnouncementsAdminPanel from "../../components/admin/AnnouncementsAdminPanel";
import SeedPitchesPanel from "../../components/admin/SeedPitchesPanel";
import PodiumTogglePanel from "../../components/admin/PodiumTogglePanel";

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function apiFetch(url, options = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}: ${text.slice(0, 200)})`);
  return data;
}

async function apiUpload(url, formData) {
  const token = await getToken();
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

// ─── Reusable pieces ──────────────────────────────────────────────
// A scroll area whose height comes from its parent, with a bottom fade that
// appears only while there is more content below the fold. Scrollbars are
// hidden site-wide, so the fade is the only cue that a list continues.
function ScrollPane({ children, className = "", innerClassName = "", fadeClassName = "h-10" }) {
  const scrollRef = useRef(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setShowFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });

    // Watch both the viewport and the content: the pane flexes with the card
    // beside it, and rows arrive after the first paint.
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div ref={scrollRef} className={`overflow-y-auto no-scrollbar ${innerClassName}`}>
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute bottom-0 left-0 right-0 transition-opacity duration-200 ${fadeClassName}`}
        style={{
          background: "linear-gradient(to bottom, rgba(11,26,59,0) 0%, rgba(11,26,59,0.8) 100%)",
          opacity: showFade ? 1 : 0,
        }}
      />
    </div>
  );
}

function GlassCard({ children, className = "", noPad = false }) {
  return (
    <div className={`rounded-2xl ${noPad ? "" : "p-5"} ${className}`}
      style={{
        background: "rgba(11,26,59,0.55)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <GlassCard className="flex items-center gap-3 !p-4">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "rgba(255,203,5,0.12)" }}>
        <span className="text-base">{icon}</span>
      </div>
      <div>
        <p className="text-xl font-bold text-white leading-none">{value}</p>
        <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-wider">{label}</p>
      </div>
    </GlassCard>
  );
}

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, past: true }); return; }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff / 3600000) % 24),
        minutes: Math.floor((diff / 60000) % 60),
        seconds: Math.floor((diff / 1000) % 60),
        past: false,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return timeLeft;
}

const PITCHES_PER_PAGE = 12;
const VOTES_PER_PAGE = 12;

// Render `text` with <mark> spans around each moderation flag's char range.
// `flags` is an array of { start_char, end_char, source, reason, category }.
function HighlightedText({ text, flags }) {
  if (!text) return null;
  const ranges = (flags || [])
    .filter(
      (f) =>
        f &&
        (f.source === "text" || f.source === "transcript" || f.source === "audio") &&
        Number.isInteger(f.start_char) &&
        Number.isInteger(f.end_char) &&
        f.end_char > f.start_char &&
        f.start_char >= 0 &&
        f.end_char <= text.length
    )
    .sort((a, b) => a.start_char - b.start_char);

  if (ranges.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  const parts = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start_char > cursor) {
      parts.push(
        <span key={`p-${i}`} className="whitespace-pre-wrap break-words">
          {text.slice(cursor, r.start_char)}
        </span>
      );
    }
    parts.push(
      <mark
        key={`m-${i}`}
        title={r.reason || r.category}
        style={{
          background: "rgba(239, 68, 68, 0.25)",
          color: "#fecaca",
          padding: "0 3px",
          borderRadius: "3px",
        }}
        className="whitespace-pre-wrap break-words"
      >
        {text.slice(r.start_char, r.end_char)}
      </mark>
    );
    cursor = r.end_char;
  });
  if (cursor < text.length) {
    parts.push(
      <span key="tail" className="whitespace-pre-wrap break-words">
        {text.slice(cursor)}
      </span>
    );
  }
  return <>{parts}</>;
}

function formatTimestamp(seconds) {
  if (typeof seconds !== "number" || isNaN(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// ─── Moderation report ──────────────────────────────────────────
// Redesigned for scannability: big verdict, one-line summary, a compact
// channel row, and detail sections that expand on click.
function ChannelDot({ label, state }) {
  const colors = {
    approved: { dot: "#4ade80", fg: "text-green-300", bg: "bg-green-500/8" },
    needs_review: { dot: "#f87171", fg: "text-red-300", bg: "bg-red-500/8" },
    rejected: { dot: "#525252", fg: "text-white/50", bg: "bg-white/[0.04]" },
    failed: { dot: "#fbbf24", fg: "text-amber-300", bg: "bg-amber-500/8" },
    processing: { dot: "#60a5fa", fg: "text-blue-300", bg: "bg-blue-500/8" },
    queued: { dot: "#60a5fa", fg: "text-blue-300", bg: "bg-blue-500/8" },
    ready: { dot: "#4ade80", fg: "text-green-300", bg: "bg-green-500/8" },
    not_applicable: { dot: "#525252", fg: "text-white/35", bg: "bg-white/[0.03]" },
  }[state] || { dot: "#525252", fg: "text-white/35", bg: "bg-white/[0.03]" };
  const stateLabel = state?.replace(/_/g, " ") || "—";
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-0 ${colors.bg}`}
      style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors.dot }} />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-widest text-white/40 leading-tight">{label}</p>
        <p className={`text-xs font-semibold capitalize truncate ${colors.fg}`}>{stateLabel}</p>
      </div>
    </div>
  );
}

function Collapsible({ title, count, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <svg className={`w-3 h-3 text-white/40 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-semibold text-white/75 flex-1">{title}</span>
        {typeof count === "number" && count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.05] text-white/50 font-mono">
            {count}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function ModerationReport({ pitch }) {
  if (!pitch) return null;

  const summary = pitch.moderation_summary || pitch.moderation_reason;
  const categories = (Array.isArray(pitch.moderation_categories) ? pitch.moderation_categories : [])
    .filter((c) => c && c.flagged !== false);
  const reasons = Array.isArray(pitch.moderation_reasons) ? pitch.moderation_reasons : [];
  const visual = pitch.visual_moderation_result || pitch.mux_moderation_result;
  const scores = pitch.moderation_scores || {};
  const hasVisual = pitch.visual_moderation_status && pitch.visual_moderation_status !== "not_applicable";
  const hasTranscript = pitch.transcript_moderation_status && pitch.transcript_moderation_status !== "not_applicable";

  const verdictStyle = {
    approved:      { bg: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))", border: "rgba(74,222,128,0.35)", fg: "#86efac", label: "Approved" },
    needs_review:  { bg: "linear-gradient(135deg, rgba(248,113,113,0.15), rgba(248,113,113,0.05))", border: "rgba(248,113,113,0.35)", fg: "#fca5a5", label: "Needs review" },
    rejected:      { bg: "linear-gradient(135deg, rgba(115,115,115,0.15), rgba(115,115,115,0.05))", border: "rgba(115,115,115,0.35)", fg: "rgba(255,255,255,0.7)", label: "Rejected" },
    failed:        { bg: "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))", border: "rgba(251,191,36,0.35)", fg: "#fcd34d", label: "Failed" },
    processing:    { bg: "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(96,165,250,0.05))", border: "rgba(96,165,250,0.35)", fg: "#93c5fd", label: "Processing" },
    queued:        { bg: "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(96,165,250,0.05))", border: "rgba(96,165,250,0.35)", fg: "#93c5fd", label: "Queued" },
    not_started:   { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.1)", fg: "rgba(255,255,255,0.5)", label: "Not started" },
  }[pitch.moderation_state] || { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.1)", fg: "rgba(255,255,255,0.5)", label: pitch.moderation_state || "—" };

  const shouldAutoOpen = pitch.moderation_state === "needs_review" || pitch.moderation_state === "rejected";

  return (
    <div className="mt-3 space-y-2.5">
      {/* Verdict banner */}
      <div className="rounded-xl p-3.5"
        style={{ background: verdictStyle.bg, border: `1px solid ${verdictStyle.border}` }}>
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <p className="text-lg font-black tracking-tight" style={{ color: verdictStyle.fg }}>
            {verdictStyle.label}
          </p>
          {typeof pitch.moderation_attempt_count === "number" && pitch.moderation_attempt_count > 0 && (
            <span className="text-[10px] text-white/40 font-mono">attempt {pitch.moderation_attempt_count}</span>
          )}
        </div>
        {summary && <p className="text-xs text-white/70 leading-relaxed">{summary}</p>}
      </div>

      {/* Channel row — only shows the ones that actually ran */}
      <div className="flex gap-2">
        <ChannelDot label="Text" state={pitch.moderation_state === "not_started" ? "not_applicable" : "approved"} />
        {hasTranscript && <ChannelDot label="Transcript" state={pitch.transcript_moderation_status} />}
        {hasVisual && <ChannelDot label="Visual (Mux)" state={pitch.visual_moderation_status} />}
      </div>

      {/* Findings */}
      {categories.length > 0 && (
        <Collapsible title="Flagged categories" count={categories.length} defaultOpen={shouldAutoOpen}>
          <div className="space-y-1.5">
            {categories.map((c, i) => {
              const sev = c.severity === "high" ? { fg: "text-red-300", bg: "bg-red-500/15" }
                        : c.severity === "medium" ? { fg: "text-amber-300", bg: "bg-amber-500/15" }
                        : { fg: "text-white/50", bg: "bg-white/[0.06]" };
              return (
                <div key={i} className="rounded-lg px-3 py-2"
                  style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-white/90">{c.category}</span>
                    {c.severity && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider ${sev.fg} ${sev.bg}`}>
                        {c.severity}
                      </span>
                    )}
                    {c.channel && (
                      <span className="text-[9px] text-white/30 uppercase tracking-wider ml-auto">
                        via {c.channel}
                      </span>
                    )}
                  </div>
                  {c.explanation && (
                    <p className="text-xs text-white/60 leading-relaxed">{c.explanation}</p>
                  )}
                  {Array.isArray(c.evidence) && c.evidence.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {c.evidence.map((e, j) => (
                        <p key={j} className="text-[11px] text-white/50 italic pl-2 border-l-2 border-red-500/30">
                          "{e}"
                        </p>
                      ))}
                    </div>
                  )}
                  {Array.isArray(c.timestamps) && c.timestamps.length > 0 && (
                    <p className="text-[10px] text-white/40 mt-1.5 font-mono">
                      {c.timestamps.map((t) => formatTimestamp(t)).join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Collapsible>
      )}

      {reasons.length > 0 && (
        <Collapsible title="Guidebook violations" count={reasons.length} defaultOpen={shouldAutoOpen}>
          <div className="space-y-1.5">
            {reasons.map((r, i) => (
              <div key={i} className="rounded-lg px-3 py-2"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}>
                {r.rule && <p className="text-xs font-semibold text-red-300 mb-0.5">{r.rule}</p>}
                {r.explanation && <p className="text-xs text-white/70 leading-relaxed">{r.explanation}</p>}
                {Array.isArray(r.evidence) && r.evidence.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {r.evidence.map((e, j) => (
                      <p key={j} className="text-[11px] text-white/50 italic pl-2 border-l-2 border-red-500/30">
                        "{e}"
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {(scores.visual || visual) && (
        <Collapsible title="Mux Robots scores" count={visual?.flagged_thumbnails?.length || 0}>
          <div className="text-xs text-white/70 space-y-1.5">
            {scores.visual && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.2)" }}>
                  <p className="text-[9px] uppercase tracking-widest text-white/40">Sexual</p>
                  <p className="text-sm font-mono text-white/90">{Number(scores.visual.sexual ?? 0).toFixed(3)}</p>
                </div>
                <div className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.2)" }}>
                  <p className="text-[9px] uppercase tracking-widest text-white/40">Violence</p>
                  <p className="text-sm font-mono text-white/90">{Number(scores.visual.violence ?? 0).toFixed(3)}</p>
                </div>
              </div>
            )}
            {!scores.visual && visual?.summary && (
              <div className="rounded-lg px-2.5 py-2"
                style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[11px] text-white/65 leading-relaxed">{visual.summary}</p>
              </div>
            )}
            {visual?.flagged_thumbnails?.length > 0 && (
              <p className="text-[11px] text-white/50">
                Flagged frames: <span className="font-mono">{visual.flagged_thumbnails.map((t) => formatTimestamp(t.time || 0)).join(" · ")}</span>
              </p>
            )}
            {(visual?.job_id || pitch.mux_moderation_job_id) && (
              <p className="text-[10px] text-white/30 font-mono break-all">
                job: {visual?.job_id || pitch.mux_moderation_job_id}
              </p>
            )}
          </div>
        </Collapsible>
      )}

      {pitch.transcript && (
        <Collapsible title={`Transcript${pitch.transcript_language ? ` (${pitch.transcript_language})` : ""}`}>
          <div className="max-h-40 overflow-y-auto no-scrollbar text-xs text-white/65 leading-relaxed whitespace-pre-wrap"
            style={{ background: "rgba(0,0,0,0.25)", borderRadius: "0.5rem", padding: "0.5rem 0.75rem" }}>
            {pitch.transcript}
          </div>
        </Collapsible>
      )}

      {(pitch.moderation_last_error || pitch.transcript_last_error) && (
        <div className="rounded-xl px-3 py-2"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <p className="text-[10px] uppercase tracking-widest text-amber-300/70 font-semibold mb-1">Pipeline error</p>
          {pitch.moderation_last_error && (
            <p className="text-xs text-amber-200/90 font-mono break-all">{pitch.moderation_last_error}</p>
          )}
          {pitch.transcript_last_error && (
            <p className="text-xs text-amber-200/90 font-mono break-all mt-1">
              Transcript: {pitch.transcript_last_error}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30 px-1">
        {pitch.moderation_started_at && (
          <span>Started {new Date(pitch.moderation_started_at).toLocaleString()}</span>
        )}
        {pitch.moderation_completed_at && (
          <span>Completed {new Date(pitch.moderation_completed_at).toLocaleString()}</span>
        )}
        {pitch.moderation_next_attempt_at && !pitch.moderation_completed_at && (
          <span>Retry {new Date(pitch.moderation_next_attempt_at).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

// Internal notes editor for the moderation panel.
// Notes are admin-visible only and stored in `moderation_admin_notes`.
function ModerationNoteEditor({ pitch, onSave, saving }) {
  const [value, setValue] = useState(pitch?.moderation_admin_notes || "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setValue(pitch?.moderation_admin_notes || "");
    setDirty(false);
  }, [pitch?.id]);
  return (
    <div className="mt-3">
      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1">
        Internal note (admins only)
      </label>
      <div className="flex gap-2 items-stretch">
        <textarea
          value={value}
          onChange={(e) => { setValue(e.target.value); setDirty(true); }}
          placeholder="Add context for other admins reviewing this pitch..."
          rows={2}
          className="flex-1 text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:border-white/20 resize-none"
        />
        <button
          disabled={!dirty || !value.trim() || saving}
          onClick={() => onSave(value.trim())}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black bg-white/70 hover:bg-white/80 transition-colors disabled:opacity-30"
        >
          {saving ? "Saving..." : "Save note"}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, loading: authLoading, isAdmin, adminChecked } = useAuth();
  const router = useRouter();

  const [competitionDate, setCompetitionDate] = useState(null);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");

  const [pitches, setPitches] = useState([]);
  const [selectedPitch, setSelectedPitch] = useState(null);
  const [pitchPage, setPitchPage] = useState(1);

  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState("");
  const [votes, setVotes] = useState([]);
  const [votePage, setVotePage] = useState(1);
  const [announcements, setAnnouncements] = useState([]);
  const [outreach, setOutreach] = useState({
    accounts: [],
    summary: null,
    resendConfigured: false,
    resendFromEmail: null,
  });
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachLoaded, setOutreachLoaded] = useState(false);
  const [outreachScope, setOutreachScope] = useState("all");
  const [outreachConfirmed, setOutreachConfirmed] = useState("all");
  const [outreachSearch, setOutreachSearch] = useState("");
  const [broadcastForm, setBroadcastForm] = useState({
    subject: "",
    message: "Heads up, get your pitch in by 5PM Friday for the upcoming Weekly Raffle!",
  });
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [winnerForm, setWinnerForm] = useState({
    recipients: "",
    subject: "You’ve been selected as a 10KP winner",
    prizeLabel: "10KP winner selection",
    note: "",
  });
  const [winnerSending, setWinnerSending] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [broadcastHistoryLoading, setBroadcastHistoryLoading] = useState(false);
  const [broadcastHistoryEnabled, setBroadcastHistoryEnabled] = useState(true);
  const [announcementForm, setAnnouncementForm] = useState({
    id: null,
    title: "",
    content: "",
    is_published: true,
  });
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [announcementDeletingId, setAnnouncementDeletingId] = useState(null);
  const [announcementTemplate, setAnnouncementTemplate] = useState("general");
  const [templateFields, setTemplateFields] = useState({
    winnerName: "",
    pitchTitle: "",
    prizeLabel: "",
    competitionName: "",
    dateValue: "",
    details: "",
  });
  const [digestData, setDigestData] = useState({
    submissions: [],
    announcements: [],
    competitionDate: null,
  });
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestLoaded, setDigestLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterType, setFilterType] = useState("");

  const [defaultThumbnails, setDefaultThumbnails] = useState({ audio: null, text: null });
  const [uploadingThumbnail, setUploadingThumbnail] = useState(null);

  const [deletingPitchId, setDeletingPitchId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("pitches");
  // Dual-lane within the Pitches tab: live cohort vs past winners.
  const [pitchesLane, setPitchesLane] = useState("current");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [chartTab, setChartTab] = useState("timeline");
  const [extractedAdminText, setExtractedAdminText] = useState(null);
  const [extractingAdminText, setExtractingAdminText] = useState(false);
  const [moderationSubmitting, setModerationSubmitting] = useState(null); // "approve"|"reject"|null
  const muxPlayerRef = useRef(null);

  const [loadingState, setLoadingState] = useState({
    date: true,
    pitches: true,
    tags: true,
    votes: true,
    announcements: true,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const timeLeft = useCountdown(competitionDate);
  const pad = (n) => String(n).padStart(2, "0");

  // Admin check now flows through AuthContext, which combines the
  // ADMIN_EMAILS env list with dynamic admins from admin_users.
  useEffect(() => {
    if (authLoading || !adminChecked) return;
    if (!user || !isAdmin) router.push("/");
  }, [authLoading, adminChecked, user, isAdmin, router]);

  // ── Filtered + paginated pitches (current-cohort lane only) ──
  const currentCohortPitches = useMemo(
    () => pitches.filter((p) => !p.is_seed),
    [pitches]
  );
  const seedPitchCount = useMemo(
    () => pitches.filter((p) => p.is_seed).length,
    [pitches]
  );

  const filteredPitches = useMemo(() => {
    let r = currentCohortPitches;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((p) => p.title?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    if (filterTag) r = r.filter((p) => p.tags?.some((t) => t.id === filterTag));
    if (filterType) {
      if (filterType === "video") r = r.filter((p) => p.file_type === "video");
      else if (filterType === "text") r = r.filter((p) => p.file_type === "file" && (p.text_content || /\.(txt|pdf|doc|docx)$/i.test(p.file_name || "")));
      else if (filterType === "audio") r = r.filter((p) => p.file_type === "file" && /\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(p.file_name || ""));
    }
    return r;
  }, [currentCohortPitches, searchQuery, filterTag, filterType]);

  const pitchTotalPages = Math.max(1, Math.ceil(filteredPitches.length / PITCHES_PER_PAGE));
  const paginatedPitches = filteredPitches.slice((pitchPage - 1) * PITCHES_PER_PAGE, pitchPage * PITCHES_PER_PAGE);
  const voteTotalPages = Math.max(1, Math.ceil(votes.length / VOTES_PER_PAGE));
  const paginatedVotes = votes.slice((votePage - 1) * VOTES_PER_PAGE, votePage * VOTES_PER_PAGE);

  // Reset page when filters change
  useEffect(() => { setPitchPage(1); }, [searchQuery, filterTag, filterType]);

  // ── Fetchers ──
  const fetchDate = useCallback(async () => {
    try { const d = await apiFetch("/api/admin/competition-date"); setCompetitionDate(d.competition_date); if (d.competition_date) setDateInput(toLocal(new Date(d.competition_date))); } catch {} finally { setLoadingState((s) => ({ ...s, date: false })); }
  }, []);
  const fetchPitches = useCallback(async () => { try { setPitches(await apiFetch("/api/admin/pitches")); } catch {} finally { setLoadingState((s) => ({ ...s, pitches: false })); } }, []);
  const fetchTags = useCallback(async () => { try { setTags(await apiFetch("/api/admin/tags")); } catch {} finally { setLoadingState((s) => ({ ...s, tags: false })); } }, []);
  const fetchVotes = useCallback(async () => { try { setVotes(await apiFetch("/api/admin/votes")); } catch {} finally { setLoadingState((s) => ({ ...s, votes: false })); } }, []);
  const fetchAnnouncements = useCallback(async () => {
    try {
      setAnnouncements(await apiFetch("/api/admin/announcements"));
    } catch {
      // ignore
    } finally {
      setLoadingState((s) => ({ ...s, announcements: false }));
    }
  }, []);
  const fetchOutreach = useCallback(async () => {
    setOutreachLoading(true);
    try {
      const params = new URLSearchParams();
      if (outreachScope !== "all") params.set("scope", outreachScope);
      if (outreachConfirmed !== "all") params.set("confirmed", outreachConfirmed);
      if (outreachSearch.trim()) params.set("search", outreachSearch.trim());
      const query = params.toString();
      const data = await apiFetch(`/api/admin/accounts${query ? `?${query}` : ""}`);
      setOutreach({
        accounts: data.accounts || [],
        summary: data.summary || null,
        resendConfigured: Boolean(data.resendConfigured),
        resendFromEmail: data.resendFromEmail || null,
      });
      setOutreachLoaded(true);
    } finally {
      setOutreachLoading(false);
    }
  }, [outreachScope, outreachConfirmed, outreachSearch]);
  const fetchBroadcastHistory = useCallback(async () => {
    setBroadcastHistoryLoading(true);
    try {
      const data = await apiFetch("/api/admin/accounts/broadcast");
      setBroadcastHistory(data.campaigns || []);
      setBroadcastHistoryEnabled(data.historyEnabled !== false);
      setOutreach((prev) => ({
        ...prev,
        resendConfigured: Boolean(data.resendConfigured),
        resendFromEmail: data.resendFromEmail || prev.resendFromEmail || null,
      }));
    } finally {
      setBroadcastHistoryLoading(false);
    }
  }, []);
  const fetchDefThumb = useCallback(async () => { try { const d = await apiFetch("/api/admin/default-thumbnails"); setDefaultThumbnails({ audio: d.default_audio_thumbnail || null, text: d.default_text_thumbnail || null }); } catch {} }, []);
  const fetchAnalytics = useCallback(async () => { setAnalyticsLoading(true); try { setAnalytics(await apiFetch("/api/admin/analytics")); } catch {} finally { setAnalyticsLoading(false); } }, []);
  const fetchDigest = useCallback(async () => {
    setDigestLoading(true);
    try {
      const [submissionsRes, announcementsRes, dateRes] = await Promise.all([
        apiFetch("/api/gallery/submissions?page=1&pageSize=24"),
        apiFetch("/api/announcements"),
        apiFetch("/api/admin/competition-date"),
      ]);

      setDigestData({
        submissions: submissionsRes?.submissions || [],
        announcements: announcementsRes || [],
        competitionDate: dateRes?.competition_date || null,
      });
      setDigestLoaded(true);
    } catch {
      // ignore
    } finally {
      setDigestLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchDate();
      fetchPitches();
      fetchTags();
      fetchVotes();
      fetchAnnouncements();
      fetchDefThumb();
    }
  }, [
    user,
    isAdmin,
    fetchDate,
    fetchPitches,
    fetchTags,
    fetchVotes,
    fetchAnnouncements,
    fetchDefThumb,
  ]);
  // Lazy-load analytics only when tab is selected
  useEffect(() => { if (activeTab === "analytics" && !analytics && !analyticsLoading) fetchAnalytics(); }, [activeTab, analytics, analyticsLoading, fetchAnalytics]);
  useEffect(() => {
    if (activeTab === "newspaper" && !digestLoaded && !digestLoading) {
      fetchDigest();
    }
  }, [activeTab, digestLoaded, digestLoading, fetchDigest]);
  useEffect(() => {
    if (activeTab === "outreach" && !outreachLoaded && !outreachLoading) {
      fetchOutreach().catch((e) => setError(e.message));
      fetchBroadcastHistory().catch((e) => setError(e.message));
    }
  }, [activeTab, outreachLoaded, outreachLoading, fetchOutreach, fetchBroadcastHistory]);
  useEffect(() => {
    if (activeTab !== "outreach" || !outreachLoaded) return;
    const timeout = setTimeout(() => {
      fetchOutreach().catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timeout);
  }, [activeTab, outreachLoaded, outreachScope, outreachConfirmed, outreachSearch, fetchOutreach]);

  // Extract text from PDF/DOC/DOCX/TXT when a text pitch is opened
  useEffect(() => {
    setExtractedAdminText(null);
    setExtractingAdminText(false);
    if (!selectedPitch?.file_path) return;
    if (!/\.(pdf|doc|docx|txt)$/i.test(selectedPitch.file_name || "")) return;
    setExtractingAdminText(true);
    // Send admin bearer token so unapproved / flagged pitches can be previewed.
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(
          `/api/gallery/extract-text?path=${encodeURIComponent(selectedPitch.file_path)}&name=${encodeURIComponent(selectedPitch.file_name || "")}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        const d = await r.json();
        if (d.text) setExtractedAdminText(d.text);
      } catch {
        /* ignore */
      } finally {
        setExtractingAdminText(false);
      }
    })();
  }, [selectedPitch?.id]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  // ── Handlers ──
  const handleSaveDate = async () => {
    setError(""); if (!dateInput) return;
    try { const d = await apiFetch("/api/admin/competition-date", { method: "POST", body: JSON.stringify({ competition_date: new Date(dateInput).toISOString() }) }); setCompetitionDate(d.competition_date); setEditingDate(false); setSuccess("Competition date updated."); } catch (e) { setError(e.message); }
  };
  const handleCreateTag = async (e) => {
    e.preventDefault(); setError(""); if (!newTagName.trim()) return;
    try { await apiFetch("/api/admin/tags", { method: "POST", body: JSON.stringify({ name: newTagName.trim() }) }); setNewTagName(""); fetchTags(); setSuccess("Tag created."); } catch (e) { setError(e.message); }
  };
  const handleDeleteTag = async (id) => { setError(""); try { await apiFetch(`/api/admin/tags?id=${id}`, { method: "DELETE" }); fetchTags(); setSuccess("Tag deleted."); } catch (e) { setError(e.message); } };
  const handleDeletePitch = async (pid) => {
    setError(""); setDeletingPitchId(pid);
    try { await apiFetch(`/api/admin/pitches?id=${pid}`, { method: "DELETE" }); setPitches((p) => p.filter((x) => x.id !== pid)); setDeleteConfirm(null); if (selectedPitch?.id === pid) setSelectedPitch(null); setSuccess("Pitch removed."); } catch (e) { setError(e.message); } finally { setDeletingPitchId(null); }
  };
  const handleModerationDecision = async (pitchId, decision, note) => {
    setError(""); setModerationSubmitting(decision);
    try {
      const d = await apiFetch("/api/admin/pitches/moderation", {
        method: "PATCH",
        body: JSON.stringify({ pitchId, decision, note: note || undefined }),
      });
      setPitches((prev) =>
        prev.map((p) => (p.id === pitchId ? { ...p, ...d.pitch } : p))
      );
      setSelectedPitch((prev) => (prev && prev.id === pitchId ? { ...prev, ...d.pitch } : prev));
      setSuccess(decision === "approve" ? "Pitch approved." : "Pitch rejected.");
    } catch (e) {
      setError(e.message);
    } finally {
      setModerationSubmitting(null);
    }
  };
  const handleModerationAction = async (pitchId, action, note) => {
    setError(""); setModerationSubmitting(action);
    try {
      const d = await apiFetch("/api/admin/pitches/moderation", {
        method: "PATCH",
        body: JSON.stringify({ pitchId, action, note: note || undefined }),
      });
      setPitches((prev) =>
        prev.map((p) => (p.id === pitchId ? { ...p, ...d.pitch } : p))
      );
      setSelectedPitch((prev) => (prev && prev.id === pitchId ? { ...prev, ...d.pitch } : prev));
      const msg = action === "retry" ? "Moderation retry queued."
                : action === "return_to_review" ? "Returned to review."
                : "Note saved.";
      setSuccess(msg);
    } catch (e) {
      setError(e.message);
    } finally {
      setModerationSubmitting(null);
    }
  };
  const seekMuxPlayer = (seconds) => {
    const player = muxPlayerRef.current;
    if (player && typeof seconds === "number") {
      try {
        player.currentTime = seconds;
        if (typeof player.play === "function") player.play().catch(() => {});
      } catch { /* ignore */ }
    }
  };
  const handleExportCSV = () => {
    if (!filteredPitches.length) { setError("No pitches to export."); return; }
    // Links in the CSV have to be absolute so they still work once the file
    // leaves this browser and lands in a supervisor's spreadsheet.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const csv = buildPitchCsv(filteredPitches, origin);
    // BOM so Excel reads the file as UTF-8 rather than mangling names.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pitches_export_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess(`CSV exported — ${filteredPitches.length} submission${filteredPitches.length === 1 ? "" : "s"}.`);
  };
  const handleRefreshOutreach = async () => {
    setError("");
    try {
      await fetchOutreach();
      await fetchBroadcastHistory();
    } catch (e) {
      setError(e.message);
    }
  };
  const handleExportAccountsCsv = () => {
    if (!(outreach.accounts || []).length) {
      setError("No matching accounts to export.");
      return;
    }
    const csv = buildAccountCsv(outreach.accounts);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `accounts_export_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess("Accounts CSV exported.");
  };
  const handleAddWinnerEmails = (emails) => {
    setWinnerForm((prev) => ({
      ...prev,
      recipients: joinEmailList(prev.recipients, emails),
    }));
  };
  const handleClearWinnerEmails = () => {
    setWinnerForm((prev) => ({ ...prev, recipients: "" }));
  };
  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    setError("");
    setBroadcastSending(true);
    try {
      const data = await apiFetch("/api/admin/accounts/broadcast", {
        method: "POST",
        body: JSON.stringify({
          subject: broadcastForm.subject,
          message: broadcastForm.message,
          scope: outreachScope,
          confirmed: outreachConfirmed,
          search: outreachSearch,
        }),
      });
      setSuccess(`Broadcast sent to ${data.recipientCount} account${data.recipientCount === 1 ? "" : "s"}.`);
      await fetchBroadcastHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setBroadcastSending(false);
    }
  };
  const handleSendWinnerAlert = async (e) => {
    e.preventDefault();
    setError("");
    setWinnerSending(true);
    try {
      const data = await apiFetch("/api/admin/accounts/winners", {
        method: "POST",
        body: JSON.stringify(winnerForm),
      });
      setSuccess(`Winner alert sent to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}.`);
      await fetchBroadcastHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setWinnerSending(false);
    }
  };
  const handleUploadDefThumb = async (type, file) => {
    if (!file) return; setUploadingThumbnail(type); setError("");
    try { const fd = new FormData(); fd.append("file", file); fd.append("type", type); const d = await apiUpload("/api/admin/upload-thumbnail", fd); setDefaultThumbnails((p) => ({ ...p, [type]: d.url })); setSuccess(`Default ${type} thumbnail updated.`); } catch (e) { setError(e.message); } finally { setUploadingThumbnail(null); }
  };
  const resetAnnouncementForm = () => {
    setAnnouncementForm({ id: null, title: "", content: "", is_published: true });
    setAnnouncementTemplate("general");
    setTemplateFields({
      winnerName: "",
      pitchTitle: "",
      prizeLabel: "",
      competitionName: "",
      dateValue: "",
      details: "",
    });
  };

  const startAnnouncementTemplate = (templateKey) => {
    setAnnouncementTemplate(templateKey);
    setAnnouncementForm((prev) => ({
      ...prev,
      id: null,
      title:
        templateKey === "winner-weekly-raffle"
          ? "Weekly Raffle Winner Announcement"
          : templateKey === "winner-pitch"
          ? "Pitch Competition Winner Announcement"
          : templateKey === "winner-monthly-grand"
          ? "Monthly Grand Prize Winner Announcement"
          : templateKey === "competition-create"
          ? "New Competition Announcement"
          : templateKey === "competition-submission-deadline"
          ? "Submission Deadline Announcement"
          : templateKey === "competition-judging-deadline"
          ? "Judging Deadline Announcement"
          : templateKey === "competition-winner-date"
          ? "Winner Announcement Date Update"
          : prev.title,
      content: "",
      is_published: true,
    }));
    setTemplateFields({
      winnerName: "",
      pitchTitle: "",
      prizeLabel:
        templateKey === "winner-weekly-raffle"
          ? "Weekly Raffle"
          : templateKey === "winner-pitch"
          ? "Pitch Competition"
          : templateKey === "winner-monthly-grand"
          ? "Monthly Grand Prize"
          : "",
      competitionName: "",
      dateValue: "",
      details: "",
    });
  };

  const buildAnnouncementPayload = () => {
    if (announcementTemplate === "general") {
      return {
        title: announcementForm.title.trim(),
        content: announcementForm.content.trim(),
      };
    }

    const templateLabel =
      announcementTemplate === "winner-weekly-raffle"
        ? "Weekly Raffle Winner"
        : announcementTemplate === "winner-pitch"
        ? "Pitch Competition Winner"
        : announcementTemplate === "winner-monthly-grand"
        ? "Monthly Grand Prize Winner"
        : announcementTemplate === "competition-create"
        ? "Competition Created"
        : announcementTemplate === "competition-submission-deadline"
        ? "Submission Deadline"
        : announcementTemplate === "competition-judging-deadline"
        ? "Judging Deadline"
        : "Winner Announcement Date";

    const lines = [];
    if (templateFields.winnerName.trim()) lines.push(`Winner: ${templateFields.winnerName.trim()}`);
    if (templateFields.pitchTitle.trim()) lines.push(`Pitch: ${templateFields.pitchTitle.trim()}`);
    if (templateFields.prizeLabel.trim()) lines.push(`Category: ${templateFields.prizeLabel.trim()}`);
    if (templateFields.competitionName.trim()) lines.push(`Competition: ${templateFields.competitionName.trim()}`);
    if (templateFields.dateValue) lines.push(`Date: ${new Date(templateFields.dateValue).toLocaleString()}`);
    if (templateFields.details.trim()) lines.push(`Details: ${templateFields.details.trim()}`);
    if (announcementForm.content.trim()) lines.push(announcementForm.content.trim());

    return {
      title: announcementForm.title.trim() || templateLabel,
      content: lines.join("\n"),
    };
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    setError("");

    const payload = buildAnnouncementPayload();

    if (!payload.title) {
      setError("Announcement title is required.");
      return;
    }
    if (!payload.content) {
      setError("Announcement content is required.");
      return;
    }

    setAnnouncementSubmitting(true);
    try {
      const requestPayload = {
        ...payload,
        is_published: announcementForm.is_published,
      };

      if (announcementForm.id) {
        await apiFetch("/api/admin/announcements", {
          method: "PUT",
          body: JSON.stringify({ id: announcementForm.id, ...requestPayload }),
        });
        setSuccess("Announcement updated.");
      } else {
        await apiFetch("/api/admin/announcements", {
          method: "POST",
          body: JSON.stringify(requestPayload),
        });
        setSuccess("Announcement created.");
      }

      resetAnnouncementForm();
      fetchAnnouncements();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnnouncementSubmitting(false);
    }
  };

  const handleEditAnnouncement = (item) => {
    const isTemplateRecord =
      item.title?.toLowerCase().includes("winner") ||
      item.title?.toLowerCase().includes("competition") ||
      item.title?.toLowerCase().includes("deadline");

    setAnnouncementTemplate(isTemplateRecord ? "general" : "general");
    setAnnouncementForm({
      id: item.id,
      title: item.title || "",
      content: item.content || "",
      is_published: Boolean(item.is_published),
    });
    setActiveTab("announcements");
  };

  const handleDeleteAnnouncement = async (id) => {
    setError("");
    setAnnouncementDeletingId(id);
    try {
      await apiFetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
      if (announcementForm.id === id) {
        resetAnnouncementForm();
      }
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      setSuccess("Announcement deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnnouncementDeletingId(null);
    }
  };

  // ── Helpers ──
  const typeLabel = (p) => { if (p.file_type === "video") return "Video"; if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(p.file_name || "")) return "Audio"; if (p.text_content || /\.(txt|pdf|doc|docx)$/i.test(p.file_name || "")) return "Text"; return "File"; };
  const typeColor = (p) => { const t = typeLabel(p); if (t === "Video") return { bg: "rgba(99,102,241,0.15)", c: "#818cf8" }; if (t === "Audio") return { bg: "rgba(236,72,153,0.15)", c: "#f472b6" }; if (t === "Text") return { bg: "rgba(34,197,94,0.15)", c: "#4ade80" }; return { bg: "rgba(255,255,255,0.08)", c: "rgba(255,255,255,0.5)" }; };
  const digestWeeklyStats = useMemo(() => {
    const submissions = digestData.submissions || [];
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weekly = submissions.filter((p) => new Date(p.created_at).getTime() >= weekAgo);
    const weeklyVotes = weekly.reduce((sum, p) => sum + (p.vote_count || 0), 0);

    return {
      count: weekly.length,
      votes: weeklyVotes,
      topTitle:
        [...weekly].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))[0]?.title ||
        "No new pitches this week",
    };
  }, [digestData.submissions]);
  const digestTopPitches = useMemo(
    () =>
      [...(digestData.submissions || [])]
        .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
        .slice(0, 6),
    [digestData.submissions]
  );
  const digestCommunityHighlights = useMemo(() => {
    const tagCounts = {};
    const creatorCounts = {};
    (digestData.submissions || []).forEach((pitch) => {
      (pitch.tags || []).forEach((tag) => {
        if (!tag?.name) return;
        tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
      });
      if (pitch.name) creatorCounts[pitch.name] = (creatorCounts[pitch.name] || 0) + 1;
    });
    return {
      hottestTag: Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0] || null,
      mostActive: Object.entries(creatorCounts).sort((a, b) => b[1] - a[1])[0] || null,
      totalCreators: Object.keys(creatorCounts).length,
    };
  }, [digestData.submissions]);
  const digestDeadline = useMemo(() => {
    if (!digestData.competitionDate) return { text: "No upcoming deadline posted yet." };
    const diff = new Date(digestData.competitionDate).getTime() - Date.now();
    const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));
    if (daysLeft < 0) return { text: "The current competition deadline has passed.", daysLeft };
    return { text: `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining until submission close.`, daysLeft };
  }, [digestData.competitionDate]);

  // ── Loading guard ──
  if (authLoading || !user || !isAdmin) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)] bg-navy">
        <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
      </div>
    );
  }

  const totalVotes = pitches.reduce((s, p) => s + (p.vote_count || 0), 0);
  const outreachTotalSummary = outreach.summary?.total || { count: 0, submitted: 0, no_pitch: 0, confirmed: 0, unconfirmed: 0, admins: 0 };
  const outreachFilteredSummary = outreach.summary?.filtered || { count: 0, submitted: 0, no_pitch: 0, confirmed: 0, unconfirmed: 0, admins: 0 };
  const winnerRecipientEmails = parseEmailList(winnerForm.recipients);
  const tabs = [
    { id: "pitches", label: "Pitches", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
    { id: "tags", label: "Tags", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /> },
    { id: "votes", label: "Votes", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
    { id: "outreach", label: "Outreach", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /> },
    { id: "announcements", label: "Announcements", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /> },
    { id: "newspaper", label: "Weekly Digest", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 5H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2zM7 9h10M7 13h6M7 17h4" /> },
    { id: "analytics", label: "Analytics", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
    { id: "settings", label: "Settings", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /> },
  ];

  // ── Pagination helper ──
  const Paginator = ({ page, total, onPrev, onNext }) => (
    <div className="flex items-center justify-between pt-3">
      <button onClick={onPrev} disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}>Prev</button>
      <span className="text-[11px] text-white/25 tabular-nums">Page {page} of {total}</span>
      <button onClick={onNext} disabled={page >= total}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}>Next</button>
    </div>
  );

  return (
    <div className="relative h-[calc(100vh-5rem)] overflow-hidden">
      <PageBackground src={adminBg} priority quality={68} />
      {/* Overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(11,26,59,0.92) 0%, rgba(6,14,33,0.88) 50%, rgba(11,26,59,0.94) 100%)" }} />

      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <aside className="fixed top-20 left-0 bottom-0 w-56 z-30 hidden lg:flex flex-col"
        style={{ background: "rgba(6,14,33,0.7)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Brand */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,203,5,0.15)" }}>
              <svg className="w-4 h-4 text-maize" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-white tracking-wide">Admin</span>
          </div>
        </div>
        <div className="h-px mx-4" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? "text-maize" : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"}`}
                style={active ? { background: "rgba(255,203,5,0.1)" } : {}}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{tab.icon}</svg>
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Countdown — landing page style */}
        <div className="px-4 pb-5">
          <div className="h-px mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
          {competitionDate && timeLeft && !timeLeft.past ? (
            <>
              <p className="text-[9px] uppercase tracking-[0.2em] mb-3 font-semibold text-maize">Competition in</p>
              <p className="font-mono font-bold text-white text-lg leading-none tracking-wide">
                {pad(timeLeft.days)}<span className="text-maize/60 mx-1">:</span>{pad(timeLeft.hours)}<span className="text-maize/60 mx-1">:</span>{pad(timeLeft.minutes)}<span className="text-maize/60 mx-1">:</span>{pad(timeLeft.seconds)}
              </p>
            </>
          ) : competitionDate && timeLeft?.past ? (
            <p className="text-xs font-bold text-maize">Competition day is here!</p>
          ) : (
            <p className="text-[10px] text-white/25">No date set</p>
          )}
        </div>
      </aside>

      {/* ── MOBILE TAB BAR (horizontally scrollable) ──────────── */}
      <div className="lg:hidden fixed top-20 left-0 right-0 z-30 overflow-x-auto no-scrollbar"
        style={{ background: "rgba(6,14,33,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex min-w-max">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap ${active ? "text-maize" : "text-white/35"}`}>
                {tab.label}
                {active && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-maize rounded-full" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT (no scroll) ────────────────────────── */}
      <main className="relative z-10 lg:ml-56 h-[calc(100vh-5rem)] flex flex-col overflow-hidden">
        <div className="lg:hidden h-12 flex-shrink-0" />

        <div className="flex-1 flex flex-col px-4 sm:px-6 lg:px-10 py-5 min-h-0">
          {/* Notifications */}
          {error && (
            <div className="mb-3 flex items-center gap-3 rounded-xl p-3 text-sm flex-shrink-0"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-red-300 flex-1">{error}</span>
              <button onClick={() => setError("")} className="text-red-400/60 hover:text-red-300 text-lg leading-none">&times;</button>
            </div>
          )}
          {success && (
            <div className="mb-3 flex items-center gap-3 rounded-xl p-3 text-sm flex-shrink-0"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-green-300">{success}</span>
            </div>
          )}

          {/* ═══ PITCHES ═══ */}
          {activeTab === "pitches" && (
            <div className="flex-1 flex flex-col min-h-0 gap-3 overflow-y-auto no-scrollbar pr-1">
              {/* Dual-lane toggle — same idea as the public gallery */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">
                <div
                  className="inline-flex items-center gap-1 rounded-full p-1"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  role="tablist"
                  aria-label="Pitches lane"
                >
                  {[
                    {
                      id: "current",
                      label: "Current Submissions",
                      count: currentCohortPitches.length,
                      accent: "#FFCB05",
                      accentOnText: "#0B1A3B",
                    },
                    {
                      id: "winners",
                      label: "Last Year's Winners",
                      count: seedPitchCount,
                      accent: "#E8A84C",
                      accentOnText: "#1a1a2e",
                    },
                  ].map((lane) => {
                    const active = pitchesLane === lane.id;
                    return (
                      <button
                        key={lane.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setPitchesLane(lane.id)}
                        className="flex items-center gap-1.5 rounded-full px-3 sm:px-4 py-1.5 text-xs sm:text-[13px] font-bold transition-all duration-200"
                        style={{
                          background: active ? lane.accent : "transparent",
                          color: active ? lane.accentOnText : "rgba(255,255,255,0.5)",
                        }}
                      >
                        {lane.id === "winners" && (
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                          </svg>
                        )}
                        {lane.label}
                        <span
                          className="text-[10px] font-black tabular-nums"
                          style={{ color: active ? lane.accentOnText : "rgba(255,255,255,0.3)" }}
                        >
                          {lane.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-white/35 w-full sm:w-auto">
                  {pitchesLane === "winners"
                    ? "Archive past winners for the gallery."
                    : "This year's submissions for moderation and review."}
                </p>
              </div>

              {pitchesLane === "current" ? (
                <>
              {/* Toolbar */}
              <GlassCard className="flex-shrink-0 !p-4">
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input type="text" placeholder="Search pitches..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                  </div>
                  <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm text-white/70 focus:outline-none focus:ring-1 focus:ring-maize/40 appearance-none cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <option value="">All Tags</option>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm text-white/70 focus:outline-none focus:ring-1 focus:ring-maize/40 appearance-none cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <option value="">All Types</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="text">Text / Document</option>
                  </select>
                  <button onClick={handleExportCSV}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors whitespace-nowrap">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export CSV
                  </button>
                </div>
                {(searchQuery || filterTag || filterType) && (
                  <p className="text-xs text-white/30 mt-2">{filteredPitches.length} of {currentCohortPitches.length} pitches{searchQuery && <span> matching &ldquo;{searchQuery}&rdquo;</span>}</p>
                )}
              </GlassCard>

              {/* Pitch list */}
              {loadingState.pitches ? (
                <div className="flex items-center justify-center py-12 flex-shrink-0">
                  <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                </div>
              ) : filteredPitches.length === 0 ? (
                <div className="flex items-center justify-center py-12 flex-shrink-0">
                  <p className="text-white/30 text-sm">{currentCohortPitches.length === 0 ? "No pitches submitted yet." : "No pitches match your filters."}</p>
                </div>
              ) : (
                <GlassCard
                  noPad
                  className="flex-shrink-0 flex flex-col overflow-hidden h-[calc(100vh-14rem)] min-h-[24rem]"
                >
                  <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar divide-y divide-white/[0.04]">
                    {filteredPitches.map((pitch) => {
                      const tc = typeColor(pitch);
                      const isFlagged = pitch.moderation_status === "flagged";
                      const isRejected = pitch.moderation_status === "rejected";
                      const isPending = pitch.moderation_status === "pending" || pitch.moderation_status === "errored";
                      return (
                        <div key={pitch.id}
                          className={`flex items-center gap-4 px-5 py-2.5 cursor-pointer transition-colors group ${isFlagged ? "hover:bg-red-500/[0.08]" : "hover:bg-white/[0.03]"}`}
                          style={isFlagged ? { background: "rgba(239, 68, 68, 0.06)", borderLeft: "3px solid #ef4444" } : undefined}
                          onClick={() => setSelectedPitch(pitch)}>
                          {isFlagged && (
                            <span title="Flagged for review" className="flex-shrink-0 text-red-400">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M4 3a1 1 0 011 1v16a1 1 0 11-2 0V4a1 1 0 011-1zm2 1h11.586a1 1 0 01.707 1.707L16 8l2.293 2.293A1 1 0 0117.586 12H6V4z" />
                              </svg>
                            </span>
                          )}
                          <span className="px-2.5 py-1 text-[11px] font-semibold rounded-lg uppercase tracking-wide flex-shrink-0"
                            style={{ background: tc.bg, color: tc.c }}>{typeLabel(pitch)}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate transition-colors ${isFlagged ? "text-red-100 group-hover:text-red-200" : "text-white group-hover:text-maize"}`}>{pitch.title}</p>
                            <p className="text-xs text-white/35 truncate mt-0.5">{pitch.name} &middot; {pitch.role || "No role"}</p>
                          </div>
                          {isFlagged && (
                            <span className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                              flagged
                            </span>
                          )}
                          {isPending && (
                            <span className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50">
                              reviewing
                            </span>
                          )}
                          {isRejected && (
                            <span className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/[0.04] text-white/30">
                              rejected
                            </span>
                          )}
                          {pitch.file_type === "video" && (
                            <span className={`hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${pitch.mux_playback_id ? "bg-green-500/10 text-green-400" : pitch.mux_error ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                              {pitch.mux_playback_id ? "ready" : pitch.mux_error ? "error" : pitch.mux_status || "pending"}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 text-white/40">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                            <span className="text-xs font-bold tabular-nums">{pitch.vote_count || 0}</span>
                          </div>
                          <span className="hidden md:block text-[11px] text-white/20 tabular-nums whitespace-nowrap">
                            {new Date(pitch.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(pitch.id); }}
                            className="p-1.5 rounded-lg text-white/10 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                          <svg className="w-4 h-4 text-white/15 group-hover:text-white/30 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="px-5 py-2 flex-shrink-0 text-[11px] text-white/30 flex items-center justify-between"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <span>
                      Showing all {filteredPitches.length}
                      {filteredPitches.length !== currentCohortPitches.length && (
                        <span className="text-white/20"> of {currentCohortPitches.length}</span>
                      )}{" "}
                      pitches
                    </span>
                    <span className="text-white/20">Scroll for more</span>
                  </div>
                </GlassCard>
              )}

              {/* Gallery podium toggle */}
              <div className="flex-shrink-0">
                <PodiumTogglePanel
                  apiFetch={apiFetch}
                  onError={setError}
                  onSuccess={setSuccess}
                />
              </div>
                </>
              ) : (
              <div className="flex-shrink-0">
                <SeedPitchesPanel
                  apiFetch={apiFetch}
                  onError={setError}
                  onSuccess={(msg) => {
                    setSuccess(msg);
                    // Refresh so the lane badge count stays accurate after
                    // upload / delete without leaving the winners lane.
                    fetchPitches();
                  }}
                  embedded
                />
              </div>
              )}
            </div>
          )}

          {/* ═══ TAGS ═══ */}
          {activeTab === "tags" && (
            <GlassCard className="flex-shrink-0">
              <h2 className="text-lg font-bold text-white mb-5">Manage Tags</h2>
              {loadingState.tags ? <p className="text-white/30 text-sm">Loading...</p> : (
                <>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {tags.length === 0 ? <p className="text-white/30 text-sm">No tags created yet.</p> : tags.map((tag) => (
                      <span key={tag.id} className="inline-flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full text-sm font-medium" style={{ background: "rgba(255,203,5,0.1)", color: "#FFCB05" }}>
                        {tag.name}
                        <button onClick={() => handleDeleteTag(tag.id)} className="w-5 h-5 rounded-full flex items-center justify-center text-maize/40 hover:text-red-400 hover:bg-red-500/15 transition-colors text-xs">&times;</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={handleCreateTag} className="flex gap-2">
                    <input type="text" placeholder="New tag name" value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                    <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors">Add Tag</button>
                  </form>
                </>
              )}
            </GlassCard>
          )}

          {/* ═══ VOTES ═══ */}
          {activeTab === "votes" && (
            <GlassCard noPad className="flex-1 flex flex-col min-h-0">
              <div className="px-5 py-4 border-b border-white/[0.04] flex-shrink-0">
                <h2 className="text-lg font-bold text-white">Votes Audit Trail</h2>
              </div>
              {loadingState.votes ? <p className="text-white/30 text-sm p-5">Loading...</p> : votes.length === 0 ? <p className="text-white/30 text-sm p-5">No votes yet.</p> : (
                <>
                  <div className="flex-1 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-white/25 border-b border-white/[0.04]">
                          <th className="text-left px-5 py-2.5 font-semibold">Voter</th>
                          <th className="text-left px-5 py-2.5 font-semibold">Pitch</th>
                          <th className="text-left px-5 py-2.5 font-semibold">Submitter</th>
                          <th className="text-left px-5 py-2.5 font-semibold">Voted At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {paginatedVotes.map((v) => (
                          <tr key={v.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-5 py-2.5 text-white/50">{v.voter_name ? `${v.voter_name} (${v.voter_email || ""})` : v.voter_email || "Unknown"}</td>
                            <td className="px-5 py-2.5 text-white font-medium">{v.pitch_title}</td>
                            <td className="px-5 py-2.5 text-white/40">{v.pitch_submitter}</td>
                            <td className="px-5 py-2.5 text-white/30 tabular-nums">{new Date(v.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {voteTotalPages > 1 && (
                    <div className="px-5 pb-3 flex-shrink-0">
                      <Paginator page={votePage} total={voteTotalPages} onPrev={() => setVotePage((p) => p - 1)} onNext={() => setVotePage((p) => p + 1)} />
                    </div>
                  )}
                </>
              )}
            </GlassCard>
          )}

          {/* ═══ OUTREACH ═══ */}
          {activeTab === "outreach" && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar">
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 pb-2">
                <GlassCard className="xl:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-maize font-semibold mb-1">
                    Account export + broadcast
                  </p>
                  <h2 className="text-lg font-bold text-white">Community Outreach</h2>
                  <p className="text-sm text-white/40 mt-2">
                    Download a filtered account list, send a broad update, or notify selected winners with the payment survey link.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                    <select
                      value={outreachScope}
                      onChange={(e) => setOutreachScope(e.target.value)}
                      className="px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-maize/40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <option value="all">All accounts</option>
                      <option value="submitted">Submitted a pitch</option>
                      <option value="no_pitch">No pitch yet</option>
                    </select>
                    <select
                      value={outreachConfirmed}
                      onChange={(e) => setOutreachConfirmed(e.target.value)}
                      className="px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-maize/40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <option value="all">All email states</option>
                      <option value="confirmed">Confirmed only</option>
                      <option value="unconfirmed">Unconfirmed only</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    placeholder="Filter by email..."
                    value={outreachSearch}
                    onChange={(e) => setOutreachSearch(e.target.value)}
                    className="w-full mt-3 px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleRefreshOutreach}
                      disabled={outreachLoading || broadcastHistoryLoading}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors disabled:opacity-60"
                    >
                      {outreachLoading ? "Refreshing..." : "Refresh list"}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportAccountsCsv}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors"
                      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      Export CSV
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-5">
                    {[
                      { label: "Matching", value: outreachFilteredSummary.count },
                      { label: "Submitted", value: outreachFilteredSummary.submitted },
                      { label: "No pitch", value: outreachFilteredSummary.no_pitch },
                      { label: "Confirmed", value: outreachFilteredSummary.confirmed },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl p-3"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <p className="text-[10px] uppercase tracking-wider text-white/30">{item.label}</p>
                        <p className="text-2xl font-black text-white mt-1">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div
                    className="rounded-xl p-3 mt-5 text-sm"
                    style={{ background: outreach.resendConfigured ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${outreach.resendConfigured ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}` }}
                  >
                    <p className={`font-semibold ${outreach.resendConfigured ? "text-green-300" : "text-red-300"}`}>
                      {outreach.resendConfigured ? "Resend ready" : "Resend not configured"}
                    </p>
                    <p className="text-white/45 mt-1">
                      {outreach.resendConfigured
                        ? `Sending from ${outreach.resendFromEmail || "your configured Resend sender"}.`
                        : "Add RESEND_API_KEY and RESEND_FROM_EMAIL before sending broadcasts."}
                    </p>
                  </div>

                  <form onSubmit={handleSendBroadcast} className="space-y-3 mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                      General broadcast
                    </p>
                    <input
                      type="text"
                      placeholder="Email subject"
                      value={broadcastForm.subject}
                      onChange={(e) => setBroadcastForm((prev) => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    <textarea
                      placeholder="Write the broadcast email..."
                      value={broadcastForm.message}
                      onChange={(e) => setBroadcastForm((prev) => ({ ...prev, message: e.target.value }))}
                      rows={8}
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40 resize-y"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    <p className="text-xs text-white/35">
                      This will target {outreachFilteredSummary.count} matching account{outreachFilteredSummary.count === 1 ? "" : "s"}.
                    </p>
                    <button
                      type="submit"
                      disabled={broadcastSending || !outreach.resendConfigured || outreachFilteredSummary.count === 0}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors disabled:opacity-60"
                    >
                      {broadcastSending ? "Sending..." : "Send broadcast"}
                    </button>
                  </form>

                  <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                      Winner notifications
                    </p>
                    <p className="text-sm text-white/40 mt-2">
                      Send winners the payment survey they need to complete before the university can issue funds.
                    </p>
                    <div
                      className="rounded-xl p-3 mt-3 text-sm"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <p className="text-white/60">Survey link</p>
                      <a
                        href={WINNER_SURVEY_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-maize text-xs break-all hover:underline mt-1 inline-block"
                      >
                        {WINNER_SURVEY_URL}
                      </a>
                    </div>

                    <form onSubmit={handleSendWinnerAlert} className="space-y-3 mt-4">
                      <input
                        type="text"
                        placeholder="Winner email subject"
                        value={winnerForm.subject}
                        onChange={(e) => setWinnerForm((prev) => ({ ...prev, subject: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                      <input
                        type="text"
                        placeholder="Prize label, raffle, or award name"
                        value={winnerForm.prizeLabel}
                        onChange={(e) => setWinnerForm((prev) => ({ ...prev, prizeLabel: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                      <textarea
                        placeholder="Winner emails, one per line or comma-separated"
                        value={winnerForm.recipients}
                        onChange={(e) => setWinnerForm((prev) => ({ ...prev, recipients: e.target.value }))}
                        rows={5}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40 resize-y"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddWinnerEmails(outreach.accounts.map((account) => account.email))}
                          className="px-3 py-2 rounded-lg text-xs font-medium text-white/70 hover:text-white transition-colors"
                          style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                          Use filtered emails
                        </button>
                        <button
                          type="button"
                          onClick={handleClearWinnerEmails}
                          className="px-3 py-2 rounded-lg text-xs font-medium text-white/50 hover:text-white/75 transition-colors"
                          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                          Clear winners
                        </button>
                      </div>
                      <textarea
                        placeholder="Optional note to include below the survey link"
                        value={winnerForm.note}
                        onChange={(e) => setWinnerForm((prev) => ({ ...prev, note: e.target.value }))}
                        rows={4}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/40 resize-y"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                      <p className="text-xs text-white/35">
                        {winnerRecipientEmails.length} winner{winnerRecipientEmails.length === 1 ? "" : "s"} queued. Each winner gets a private email with the survey link.
                      </p>
                      <button
                        type="submit"
                        disabled={winnerSending || !outreach.resendConfigured || winnerRecipientEmails.length === 0}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors disabled:opacity-60"
                      >
                        {winnerSending ? "Sending..." : "Send winner alert"}
                      </button>
                    </form>
                  </div>
                </GlassCard>

                {/* The grid row is sized by the Outreach card alone: this wrapper holds
                    an absolutely-positioned card, so its content never pushes the row
                    taller. The card then fills the wrapper exactly, ending level with
                    the "Send winner alert" button, and the two lists inside scroll to
                    fit. Below xl the columns stack and it all reverts to normal flow. */}
                <div className="xl:col-span-3 xl:relative">
                <GlassCard noPad className="flex flex-col xl:absolute xl:inset-0">
                  <div className="px-5 py-4 border-b border-white/[0.04] flex-shrink-0">
                    <h2 className="text-lg font-bold text-white">Matching Accounts</h2>
                    <p className="text-xs text-white/30 mt-1">
                      {outreachFilteredSummary.count} of {outreachTotalSummary.count} accounts
                    </p>
                  </div>

                  {outreachLoading ? (
                    <div className="h-64 xl:h-auto xl:flex-1 xl:min-h-0 flex items-center justify-center">
                      <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    </div>
                  ) : outreach.accounts.length === 0 ? (
                    <p className="text-white/30 text-sm p-5 xl:flex-1">No accounts match the current filters.</p>
                  ) : (
                    // The account list grows with every signup, so it scrolls
                    // inside the card rather than stretching the page. On xl it
                    // fills the height the Outreach card sets beside it; stacked
                    // below xl it falls back to a fixed cap.
                    <ScrollPane
                      className="xl:flex-1 xl:min-h-0"
                      innerClassName="max-h-[26rem] xl:max-h-none xl:h-full"
                    >
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10" style={{ background: "rgba(11,26,59,0.92)", backdropFilter: "blur(12px)" }}>
                          <tr className="text-[10px] uppercase tracking-wider text-white/25 border-b border-white/[0.04]">
                            <th className="text-left px-5 py-2.5 font-semibold">Email</th>
                            <th className="text-left px-5 py-2.5 font-semibold">Joined</th>
                            <th className="text-left px-5 py-2.5 font-semibold">Confirmed</th>
                            <th className="text-left px-5 py-2.5 font-semibold">Pitches</th>
                            <th className="text-left px-5 py-2.5 font-semibold">Last Sign In</th>
                            <th className="text-left px-5 py-2.5 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                          {outreach.accounts.map((account) => (
                            <tr key={account.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-white/85">{account.email}</span>
                                  {account.is_admin && (
                                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/45">
                                      Admin
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-2.5 text-white/35 tabular-nums">
                                {account.created_at ? new Date(account.created_at).toLocaleString() : "—"}
                              </td>
                              <td className="px-5 py-2.5">
                                <span className={`text-xs font-semibold ${account.confirmed ? "text-green-300" : "text-white/40"}`}>
                                  {account.confirmed ? "Confirmed" : "Pending"}
                                </span>
                              </td>
                              <td className="px-5 py-2.5 text-white/55">
                                {account.pitch_count}
                              </td>
                              <td className="px-5 py-2.5 text-white/30 tabular-nums">
                                {account.last_sign_in_at ? new Date(account.last_sign_in_at).toLocaleString() : "Never"}
                              </td>
                              <td className="px-5 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleAddWinnerEmails([account.email])}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/65 hover:text-white transition-colors"
                                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                                >
                                  Add winner
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollPane>
                  )}

                  <div className="border-t border-white/[0.04] flex-shrink-0 xl:flex xl:flex-col xl:min-h-0 xl:max-h-[45%]">
                    <div className="px-5 py-4 flex-shrink-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Outreach History</h3>
                          <p className="text-xs text-white/30 mt-1">
                            Recent broadcasts and winner notifications recorded by this app.
                          </p>
                        </div>
                        {!broadcastHistoryEnabled && (
                          <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-amber-500/10 text-amber-300">
                            Run migration
                          </span>
                        )}
                      </div>
                    </div>
                    {broadcastHistoryLoading ? (
                      <p className="text-white/30 text-sm px-5 pb-5">Loading history...</p>
                    ) : broadcastHistory.length === 0 ? (
                      <p className="text-white/30 text-sm px-5 pb-5">
                        {broadcastHistoryEnabled ? "No outreach sends yet." : "Outreach sends will appear here after the SQL migration is applied."}
                      </p>
                    ) : (
                      <ScrollPane
                        className="xl:flex-1 xl:min-h-0"
                        innerClassName="max-h-[20rem] xl:max-h-none xl:h-full divide-y divide-white/[0.03]"
                        fadeClassName="h-8"
                      >
                        {broadcastHistory.map((item) => (
                          <div key={item.id} className="px-5 py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-white truncate">{item.subject}</h4>
                                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/10 text-green-300">
                                    {item.details?.type === "winner_notification" ? "Winner alert" : item.status || "sent"}
                                  </span>
                                </div>
                                <p className="text-xs text-white/40 mt-1">
                                  {item.recipient_count || 0} recipients • scope {item.recipient_scope || "all"} • {item.confirmed_filter || "all"}
                                </p>
                                <p className="text-[10px] text-white/25 mt-2">
                                  {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                                  {item.created_by ? ` • ${item.created_by}` : ""}
                                </p>
                              </div>
                              <div className="text-right text-[10px] text-white/25 font-mono flex-shrink-0">
                                {item.resend_broadcast_id ? item.resend_broadcast_id.slice(0, 8) : "local"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </ScrollPane>
                    )}
                  </div>
                </GlassCard>
                </div>
              </div>
            </div>
          )}

                    {/* ═══ ANNOUNCEMENTS ═══ */}
          {activeTab === "announcements" && (
            <AnnouncementsAdminPanel
              apiFetch={apiFetch}
              onError={(m) => setError(m)}
              onSuccess={(m) => setSuccess(m)}
            />
          )}

          {/* ═══ WEEKLY DIGEST ═══ */}
          {activeTab === "newspaper" && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {digestLoading ? (
                <div className="h-full flex items-center justify-center">
                  <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 pb-2">
                  <GlassCard className="xl:col-span-2">
                    <h2 className="text-2xl font-bold text-white">10KP Weekly Digest</h2>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <p className="text-[10px] uppercase tracking-wider text-white/35">New This Week</p>
                        <p className="text-3xl font-black text-white mt-1">{digestWeeklyStats.count}</p>
                      </div>
                      <div className="rounded-xl p-4 bg-maize text-navy">
                        <p className="text-[10px] uppercase tracking-wider text-navy/70">Weekly Votes</p>
                        <p className="text-3xl font-black mt-1">{digestWeeklyStats.votes}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <p className="text-[10px] uppercase tracking-wider text-white/35">Top Weekly Pitch</p>
                        <p className="text-sm font-semibold text-white mt-2 line-clamp-2">{digestWeeklyStats.topTitle}</p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard>
                    <h3 className="text-lg font-bold text-white">Upcoming Deadlines</h3>
                    <p className="text-sm text-white/55 mt-2">{digestDeadline.text}</p>
                    {digestData.competitionDate && (
                      <p className="text-xs text-white/35 mt-3">
                        Scheduled for {new Date(digestData.competitionDate).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
                      </p>
                    )}
                  </GlassCard>

                  <GlassCard className="xl:col-span-2">
                    <h3 className="text-lg font-bold text-white">Platform Updates</h3>
                    <div className="mt-3 space-y-2">
                      {digestData.announcements.length === 0 ? (
                        <p className="text-sm text-white/35">No platform updates posted this week.</p>
                      ) : (
                        digestData.announcements.slice(0, 4).map((a) => (
                          <div key={a.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-white">{a.title}</p>
                              <span className="text-[10px] text-white/30">{new Date(a.updated_at || a.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs text-white/55 mt-1 whitespace-pre-wrap line-clamp-3">{a.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </GlassCard>

                  <GlassCard>
                    <h3 className="text-lg font-bold text-white">Community Highlights</h3>
                    <div className="mt-3 space-y-3 text-sm">
                      <div>
                        <p className="text-white/35">Hottest Tag</p>
                        <p className="font-semibold text-white">{digestCommunityHighlights.hottestTag ? `${digestCommunityHighlights.hottestTag[0]} (${digestCommunityHighlights.hottestTag[1]} pitches)` : "No tags yet"}</p>
                      </div>
                      <div>
                        <p className="text-white/35">Most Active Founder</p>
                        <p className="font-semibold text-white">{digestCommunityHighlights.mostActive ? `${digestCommunityHighlights.mostActive[0]} (${digestCommunityHighlights.mostActive[1]} submissions)` : "No submissions yet"}</p>
                      </div>
                      <div>
                        <p className="text-white/35">Contributing Founders</p>
                        <p className="font-semibold text-white">{digestCommunityHighlights.totalCreators}</p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="xl:col-span-3">
                    <h3 className="text-lg font-bold text-white">Top Pitches</h3>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {digestTopPitches.length === 0 ? (
                        <p className="text-sm text-white/35">No pitches available yet.</p>
                      ) : (
                        digestTopPitches.map((pitch, idx) => (
                          <div key={pitch.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <p className="text-[10px] uppercase tracking-wider text-white/35">Rank #{idx + 1}</p>
                            <p className="text-sm font-semibold text-white mt-1 line-clamp-2">{pitch.title}</p>
                            <p className="text-xs text-white/35 mt-1">By {pitch.name}</p>
                            <p className="text-xs text-white/55 mt-2 line-clamp-2">{pitch.description}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[11px] text-white/30">{(pitch.tags || []).slice(0, 2).map((t) => t.name).join(", ") || "No tags"}</span>
                              <span className="text-sm font-bold text-maize">👍 {pitch.vote_count || 0}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </GlassCard>
                </div>
              )}
            </div>
          )}

          {/* ═══ ANALYTICS ═══ */}
          {activeTab === "analytics" && (
            <div className="flex-1 flex flex-col min-h-0">
              {analyticsLoading || !analytics ? (
                <div className="flex-1 flex items-center justify-center">
                  <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                </div>
              ) : (
                <>
                  {/* Row 1: Stat cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 flex-shrink-0">
                    <StatCard label="Pitches" value={analytics.summary.totalPitches} icon="📦" />
                    <StatCard label="Total Votes" value={analytics.summary.totalVotes} icon="👍" />
                    <StatCard label="Unique Voters" value={analytics.summary.uniqueVoters} icon="👤" />
                    <StatCard label="Avg Votes/Pitch" value={analytics.summary.avgVotesPerPitch} icon="📊" />
                    <StatCard label="Video Views" value={analytics.mux.totalViews ?? "N/A"} icon="👁️" />
                  </div>

                  {/* Single tabbed graph */}
                  {(() => {
                    const chartTabs = [
                      { id: "timeline", label: "Activity", subtitle: "Last 30 days" },
                      { id: "types", label: "Pitch Types", subtitle: "Video / Audio / Text" },
                      { id: "topPitches", label: "Top Pitches", subtitle: "Ranked by votes" },
                      { id: "tags", label: "Tags", subtitle: "Most used" },
                      { id: "schools", label: "Schools", subtitle: "Submission distribution" },
                      { id: "videoViews", label: "Video Views", subtitle: "Mux playback" },
                    ];
                    const current = chartTabs.find((t) => t.id === chartTab) || chartTabs[0];
                    return (
                      <GlassCard className="flex-1 flex flex-col !p-0 min-h-0 overflow-hidden">
                        {/* Tab strip */}
                        <div className="flex items-center gap-1 px-3 pt-3 overflow-x-auto flex-shrink-0"
                          style={{ scrollbarWidth: "none", msOverflowStyle: "none", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          {chartTabs.map((t) => {
                            const active = chartTab === t.id;
                            return (
                              <button key={t.id} onClick={() => setChartTab(t.id)}
                                className="px-3.5 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-all relative flex-shrink-0"
                                style={{
                                  color: active ? "#FFCB05" : "rgba(255,255,255,0.4)",
                                  background: active ? "rgba(255,203,5,0.08)" : "transparent",
                                }}>
                                {t.label}
                                {active && <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full" style={{ background: "#FFCB05" }} />}
                              </button>
                            );
                          })}
                        </div>

                        {/* Header row: title + legend/meta */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
                          <div>
                            <p className="text-sm font-bold text-white leading-none">{current.label}</p>
                            <p className="text-[10px] uppercase tracking-widest text-white/30 mt-1">{current.subtitle}</p>
                          </div>
                          {chartTab === "timeline" && (
                            <div className="flex gap-4">
                              <span className="flex items-center gap-1.5 text-[10px] text-white/40"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(99,102,241,0.5)" }} />Submissions</span>
                              <span className="flex items-center gap-1.5 text-[10px] text-white/40"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(255,203,5,0.6)" }} />Votes</span>
                            </div>
                          )}
                          {chartTab === "types" && (
                            <div className="flex gap-4">
                              <span className="flex items-center gap-1.5 text-[10px] text-white/40"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(99,102,241,0.7)" }} />Video ({analytics.typeBreakdown.video})</span>
                              <span className="flex items-center gap-1.5 text-[10px] text-white/40"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(236,72,153,0.7)" }} />Audio ({analytics.typeBreakdown.audio})</span>
                              <span className="flex items-center gap-1.5 text-[10px] text-white/40"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(34,197,94,0.7)" }} />Text ({analytics.typeBreakdown.text})</span>
                            </div>
                          )}
                          {chartTab === "videoViews" && analytics.mux.totalWatchTime != null && (
                            <span className="text-[10px] text-white/40">{Math.round(analytics.mux.totalWatchTime / 1000)}s total watched</span>
                          )}
                        </div>

                        {/* Chart body */}
                        <div className="flex-1 min-h-0 px-5 pb-5 overflow-hidden">
                          {/* ── Activity Timeline (auto-scaled with Y-axis + gridlines) ── */}
                          {chartTab === "timeline" && (() => {
                            const tl = analytics.timeline || [];
                            const rawMax = Math.max(...tl.map((d) => d.submissions + d.votes), 0);

                            // Nice-round the max so gridlines land on clean numbers.
                            const niceMax = (v) => {
                              if (v <= 0) return 4;
                              const exp = Math.floor(Math.log10(v));
                              const base = Math.pow(10, exp);
                              const norm = v / base;
                              let nice;
                              if (norm <= 1) nice = 1;
                              else if (norm <= 2) nice = 2;
                              else if (norm <= 2.5) nice = 2.5;
                              else if (norm <= 5) nice = 5;
                              else nice = 10;
                              return nice * base;
                            };
                            const scaleMax = niceMax(rawMax);
                            const TICKS = 4; // 0, 1/4, 1/2, 3/4, max
                            const tickValues = Array.from({ length: TICKS + 1 }, (_, i) => (scaleMax * (TICKS - i)) / TICKS);

                            // Sparse X-axis: show ~6 labels evenly spaced.
                            const labelStep = Math.max(1, Math.ceil(tl.length / 6));

                            return (
                              <div className="h-full flex flex-col">
                                {/* Plot area: Y-axis column + bar area */}
                                <div className="flex-1 flex min-h-0">
                                  {/* Y-axis labels */}
                                  <div className="flex flex-col justify-between pr-2 text-[10px] text-white/30 tabular-nums text-right flex-shrink-0" style={{ width: "28px" }}>
                                    {tickValues.map((v, i) => (
                                      <span key={i} style={{ lineHeight: 1 }}>{Number.isInteger(v) ? v : v.toFixed(1)}</span>
                                    ))}
                                  </div>

                                  {/* Chart area with gridlines */}
                                  <div className="relative flex-1 min-w-0">
                                    {/* Horizontal gridlines */}
                                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                      {tickValues.map((_, i) => (
                                        <div key={i} className="w-full" style={{ height: "1px", background: i === TICKS ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)" }} />
                                      ))}
                                    </div>

                                    {/* Bars */}
                                    <div className="absolute inset-0 flex items-end gap-px">
                                      {tl.map((d, i) => {
                                        const subH = scaleMax > 0 ? (d.submissions / scaleMax) * 100 : 0;
                                        const voteH = scaleMax > 0 ? (d.votes / scaleMax) * 100 : 0;
                                        return (
                                          <div key={i} className="flex-1 flex flex-col justify-end items-center gap-0 group relative h-full" style={{ minWidth: 0 }}>
                                            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 pointer-events-none left-1/2 -translate-x-1/2">
                                              <div className="rounded-lg px-2 py-1 text-[10px] text-white whitespace-nowrap" style={{ background: "rgba(11,26,59,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                                {d.date.slice(5)}: {d.submissions}s, {d.votes}v
                                              </div>
                                            </div>
                                            <div className="w-full rounded-t-sm" style={{ height: `${voteH}%`, minHeight: d.votes > 0 ? "2px" : 0, background: "rgba(255,203,5,0.6)" }} />
                                            <div className="w-full" style={{ height: `${subH}%`, minHeight: d.submissions > 0 ? "2px" : 0, background: "rgba(99,102,241,0.5)" }} />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {/* X-axis date labels */}
                                <div className="flex mt-1.5 flex-shrink-0" style={{ paddingLeft: "28px" }}>
                                  <div className="flex-1 flex gap-px">
                                    {tl.map((d, i) => (
                                      <div key={i} className="flex-1 text-center text-[9px] text-white/25 tabular-nums truncate" style={{ minWidth: 0 }}>
                                        {i % labelStep === 0 ? d.date.slice(5) : ""}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* ── Pitch Types donut ── */}
                          {chartTab === "types" && (() => {
                            const { video, audio, text } = analytics.typeBreakdown;
                            const total = video + audio + text || 1;
                            const vDeg = (video / total) * 360;
                            const aDeg = (audio / total) * 360;
                            return (
                              <div className="h-full flex items-center justify-center">
                                <div className="relative rounded-full" style={{
                                  width: "min(240px, 60%)",
                                  aspectRatio: "1 / 1",
                                  background: `conic-gradient(
                                    rgba(99,102,241,0.75) 0deg ${vDeg}deg,
                                    rgba(236,72,153,0.75) ${vDeg}deg ${vDeg + aDeg}deg,
                                    rgba(34,197,94,0.75) ${vDeg + aDeg}deg 360deg
                                  )`
                                }}>
                                  <div className="absolute inset-6 rounded-full flex flex-col items-center justify-center" style={{ background: "rgba(11,26,59,0.85)" }}>
                                    <span className="text-4xl font-black text-white leading-none">{total}</span>
                                    <span className="text-[10px] uppercase tracking-widest text-white/30 mt-1">Pitches</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* ── Top Pitches ── */}
                          {chartTab === "topPitches" && (
                            <div className="h-full flex flex-col justify-center gap-2 overflow-y-auto">
                              {(analytics.topPitchesByVotes || []).length === 0 ? (
                                <p className="text-xs text-white/25 text-center">No votes yet</p>
                              ) : analytics.topPitchesByVotes.map((p, i) => {
                                const maxV = analytics.topPitchesByVotes[0]?.votes || 1;
                                const tc = p.type === "video" ? "rgba(99,102,241,0.6)" : p.type === "audio" ? "rgba(236,72,153,0.6)" : "rgba(34,197,94,0.6)";
                                return (
                                  <div key={i} className="flex items-center gap-3 min-w-0">
                                    <span className="text-[10px] text-white/25 w-4 flex-shrink-0 tabular-nums text-right">{i + 1}</span>
                                    <span className="text-[12px] text-white/60 truncate w-48 flex-shrink-0" title={p.title}>{p.title}</span>
                                    <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                                      <div className="h-full rounded-md flex items-center pl-2 transition-all" style={{ width: `${Math.max((p.votes / maxV) * 100, 8)}%`, background: tc }}>
                                        <span className="text-[10px] font-bold text-white/90">{p.votes}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* ── Tag Popularity ── */}
                          {chartTab === "tags" && (
                            <div className="h-full flex flex-col justify-center gap-2 overflow-y-auto">
                              {(analytics.tagPopularity || []).length === 0 ? (
                                <p className="text-xs text-white/25 text-center">No tags used</p>
                              ) : analytics.tagPopularity.map((t, i) => {
                                const maxT = analytics.tagPopularity[0]?.count || 1;
                                return (
                                  <div key={i} className="flex items-center gap-3 min-w-0">
                                    <span className="text-[12px] text-white/60 truncate w-40 flex-shrink-0">{t.name}</span>
                                    <div className="flex-1 h-4 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                                      <div className="h-full rounded-md transition-all" style={{ width: `${Math.max((t.count / maxT) * 100, 8)}%`, background: "rgba(255,203,5,0.5)" }} />
                                    </div>
                                    <span className="text-[11px] text-white/40 tabular-nums w-6 text-right">{t.count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* ── Schools ── */}
                          {chartTab === "schools" && (
                            <div className="h-full flex flex-col justify-center gap-2 overflow-y-auto">
                              {(analytics.schoolDistribution || []).length === 0 ? (
                                <p className="text-xs text-white/25 text-center">No school data</p>
                              ) : analytics.schoolDistribution.map((s, i) => {
                                const maxS = analytics.schoolDistribution[0]?.count || 1;
                                return (
                                  <div key={i} className="flex items-center gap-3 min-w-0">
                                    <span className="text-[12px] text-white/60 truncate w-40 flex-shrink-0" title={s.name}>{s.name}</span>
                                    <div className="flex-1 h-4 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                                      <div className="h-full rounded-md transition-all" style={{ width: `${Math.max((s.count / maxS) * 100, 8)}%`, background: "rgba(59,130,246,0.5)" }} />
                                    </div>
                                    <span className="text-[11px] text-white/40 tabular-nums w-6 text-right">{s.count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* ── Mux Video Views ── */}
                          {chartTab === "videoViews" && (
                            <div className="h-full flex flex-col justify-center gap-2 overflow-y-auto">
                              {analytics.mux.totalViews == null ? (
                                <p className="text-xs text-white/25 text-center">Mux Data unavailable</p>
                              ) : analytics.mux.topVideos.length === 0 ? (
                                <p className="text-xs text-white/25 text-center">No video views yet</p>
                              ) : analytics.mux.topVideos.map((v, i) => {
                                const maxMV = analytics.mux.topVideos[0]?.views || 1;
                                return (
                                  <div key={i} className="flex items-center gap-3 min-w-0">
                                    <span className="text-[12px] text-white/60 truncate w-40 flex-shrink-0" title={v.title}>{v.title}</span>
                                    <div className="flex-1 h-4 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                                      <div className="h-full rounded-md flex items-center pl-2 transition-all" style={{ width: `${Math.max((v.views / maxMV) * 100, 8)}%`, background: "rgba(168,85,247,0.5)" }}>
                                        <span className="text-[10px] font-bold text-white/90">{v.views}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </GlassCard>
                    );
                  })()}
                </>
              )}
            </div>
          )}

                    {/* ═══ SETTINGS ═══ */}
          {activeTab === "settings" && (
            <SettingsPanel
              apiFetch={apiFetch}
              apiUpload={apiUpload}
              onError={(m) => setError(m)}
              onSuccess={(m) => setSuccess(m)}
              defaultThumbnails={defaultThumbnails}
              uploadingThumbnail={uploadingThumbnail}
              onUploadDefaultThumbnail={handleUploadDefThumb}
            />
          )}
        </div>
      </main>

      {/* ═══ PITCH DETAIL MODAL (viewport-fitted, no scroll) ═══ */}
      {selectedPitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 sm:px-6 sm:py-6"
          onClick={() => setSelectedPitch(null)}>
          <div className="w-full max-w-5xl max-h-full flex flex-col rounded-2xl overflow-hidden"
            style={{ background: "rgba(11,26,59,0.94)", backdropFilter: "blur(32px)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-4 sm:px-7 pt-5 sm:pt-6 pb-3 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <span className="px-2.5 py-1 text-[11px] font-semibold rounded-lg uppercase tracking-wide"
                    style={{ background: typeColor(selectedPitch).bg, color: typeColor(selectedPitch).c }}>{typeLabel(selectedPitch)}</span>
                  {selectedPitch.file_type === "video" && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${selectedPitch.mux_playback_id ? "bg-green-500/10 text-green-400" : selectedPitch.mux_error ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {selectedPitch.mux_playback_id ? "ready" : selectedPitch.mux_error ? "error" : selectedPitch.mux_status || "pending"}
                    </span>
                  )}
                  {selectedPitch.moderation_status && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      selectedPitch.moderation_status === "approved" ? "bg-green-500/10 text-green-400"
                      : selectedPitch.moderation_status === "flagged" ? "bg-red-500/15 text-red-300"
                      : selectedPitch.moderation_status === "rejected" ? "bg-white/[0.05] text-white/40"
                      : selectedPitch.moderation_status === "errored" ? "bg-amber-500/10 text-amber-300"
                      : "bg-white/[0.06] text-white/50"
                    }`}>
                      {selectedPitch.moderation_status}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white leading-tight truncate">{selectedPitch.title}</h2>
                <p className="text-xs text-white/40 mt-1">by {selectedPitch.name} &middot; {selectedPitch.role || "No role"} &middot; {new Date(selectedPitch.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
              <button onClick={() => setSelectedPitch(null)} className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Scrollable content — everything below the sticky header scrolls together */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">

            {/* Moderation review panel — visible when the pitch is flagged, pending, errored, or already-reviewed */}
            {selectedPitch.moderation_status && selectedPitch.moderation_status !== "approved" && (
              <div className="mx-4 sm:mx-7 mb-3 rounded-xl p-3"
                style={{
                  background: selectedPitch.moderation_status === "flagged" ? "rgba(239, 68, 68, 0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedPitch.moderation_status === "flagged" ? "rgba(239, 68, 68, 0.25)" : "rgba(255,255,255,0.06)"}`,
                }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4 3a1 1 0 011 1v16a1 1 0 11-2 0V4a1 1 0 011-1zm2 1h11.586a1 1 0 01.707 1.707L16 8l2.293 2.293A1 1 0 0117.586 12H6V4z" />
                      </svg>
                      <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                        Moderation Review
                      </p>
                    </div>
                    {selectedPitch.moderation_reason && (
                      <p className="text-xs text-white/60 mb-2">{selectedPitch.moderation_reason}</p>
                    )}
                    {selectedPitch.moderation_reviewed_by && (
                      <p className="text-[10px] text-white/30 mt-2">
                        Last reviewed by {selectedPitch.moderation_reviewed_by}
                        {selectedPitch.moderation_reviewed_at && ` on ${new Date(selectedPitch.moderation_reviewed_at).toLocaleString()}`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0 min-w-[140px]">
                    <button
                      disabled={moderationSubmitting !== null}
                      onClick={() => handleModerationDecision(selectedPitch.id, "approve")}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black bg-green-400 hover:bg-green-300 transition-colors disabled:opacity-50"
                    >
                      {moderationSubmitting === "approve" ? "Approving..." : "Approve"}
                    </button>
                    <button
                      disabled={moderationSubmitting !== null}
                      onClick={() => handleModerationDecision(selectedPitch.id, "reject")}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                      {moderationSubmitting === "reject" ? "Rejecting..." : "Reject"}
                    </button>
                    <button
                      disabled={moderationSubmitting !== null}
                      onClick={() => handleModerationAction(selectedPitch.id, "return_to_review")}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 transition-colors disabled:opacity-50"
                      title="Return to needs-review queue"
                    >
                      {moderationSubmitting === "return_to_review" ? "Returning..." : "Return to review"}
                    </button>
                    <button
                      disabled={moderationSubmitting !== null}
                      onClick={() => handleModerationAction(selectedPitch.id, "retry")}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 transition-colors disabled:opacity-50"
                      title="Re-run the automated moderation pipeline"
                    >
                      {moderationSubmitting === "retry" ? "Retrying..." : "Retry moderation"}
                    </button>
                  </div>
                </div>
                <ModerationReport pitch={selectedPitch} />
                <ModerationNoteEditor
                  pitch={selectedPitch}
                  onSave={(note) => handleModerationAction(selectedPitch.id, "add_note", note)}
                  saving={moderationSubmitting === "add_note"}
                />
              </div>
            )}

            {/* Body — flex column on mobile, row on desktop. Parent wrapper handles scrolling. */}
            <div className="flex flex-col md:flex-row px-4 sm:px-7 pb-5 sm:pb-6 gap-4 md:gap-6">
              <div className="flex-1 flex flex-col min-w-0">
                {selectedPitch.file_type === "video" && selectedPitch.mux_playback_id && (
                  <div className="rounded-xl overflow-hidden flex-shrink-0 mb-4" style={{ maxHeight: "45vh" }}>
                    <MuxPlayer ref={muxPlayerRef} playbackId={selectedPitch.mux_playback_id} accentColor="#FFCB05" style={{ width: "100%", maxHeight: "45vh" }} />
                  </div>
                )}
                {selectedPitch.file_type === "video" && !selectedPitch.mux_playback_id && (
                  <div className="mb-4 flex items-center justify-center h-32 rounded-xl flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className={`text-sm ${selectedPitch.mux_error ? "text-red-400" : "text-white/30"}`}>
                      {selectedPitch.mux_error || `Video is ${selectedPitch.mux_status || "processing"}...`}
                    </p>
                  </div>
                )}

                {/* Audio — Mux-backed */}
                {(typeLabel(selectedPitch) === "Audio" || selectedPitch.file_type === "audio") && selectedPitch.mux_playback_id && (
                  <div className="mb-4 flex-shrink-0 flex items-center gap-3 rounded-xl p-3"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {selectedPitch.thumbnail_path && (
                      <img src={selectedPitch.thumbnail_path} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <MuxPlayer ref={muxPlayerRef} playbackId={selectedPitch.mux_playback_id} accentColor="#FFCB05" audio style={{ width: "100%" }} />
                  </div>
                )}
                {/* Audio — legacy Supabase-hosted */}
                {(typeLabel(selectedPitch) === "Audio" || selectedPitch.file_type === "audio") && !selectedPitch.mux_playback_id && selectedPitch.file_path && (
                  <div className="mb-4 flex-shrink-0 flex items-center gap-3 rounded-xl p-3"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {selectedPitch.thumbnail_path && (
                      <img src={selectedPitch.thumbnail_path} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <audio controls className="w-full" style={{ filter: "invert(1) hue-rotate(180deg)", opacity: 0.75 }}>
                      <source src={`/api/gallery/stream-audio?path=${encodeURIComponent(selectedPitch.file_path)}`} />
                    </audio>
                  </div>
                )}
                {/* Audio — processing */}
                {(typeLabel(selectedPitch) === "Audio" || selectedPitch.file_type === "audio") && !selectedPitch.mux_playback_id && !selectedPitch.file_path && (
                  <div className="mb-4 flex items-center justify-center h-20 rounded-xl flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className={`text-sm ${selectedPitch.mux_error ? "text-red-400" : "text-white/30"}`}>
                      {selectedPitch.mux_error || `Audio is ${selectedPitch.mux_status || "processing"}...`}
                    </p>
                  </div>
                )}

                {selectedPitch.thumbnail_path && !selectedPitch.mux_playback_id && typeLabel(selectedPitch) !== "Audio" && (
                  <div className="mb-4 flex-shrink-0">
                    <img src={selectedPitch.thumbnail_path} alt="Thumbnail" className="max-h-32 rounded-xl object-cover" style={{ border: "1px solid rgba(255,255,255,0.08)" }} />
                  </div>
                )}

                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Description</p>
                  <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap break-words">
                    {selectedPitch.description ? (
                      <HighlightedText text={selectedPitch.description} flags={selectedPitch.moderation_flags} />
                    ) : (
                      <span className="italic text-white/25">No description</span>
                    )}
                  </p>

                  {(extractedAdminText || selectedPitch.text_content || extractingAdminText) && (
                    <div className="mt-4">
                      <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Pitch Text</p>
                      {extractingAdminText ? (
                        <div className="flex items-center gap-2 text-xs text-white/30">
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Extracting text...
                        </div>
                      ) : (
                        <div className="rounded-xl p-3 text-sm text-white/55 leading-relaxed"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <HighlightedText text={extractedAdminText || selectedPitch.text_content || ""} flags={selectedPitch.moderation_flags} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="w-full md:w-64 flex-shrink-0 flex flex-col space-y-4">
                <div className="space-y-3">
                  {[
                    { l: "Uniqname", v: selectedPitch.uniqname ? `${selectedPitch.uniqname}@umich.edu` : "Not provided" },
                    { l: "Account Email", v: selectedPitch.submitter_email || "Unknown" },
                    {
                      l: "Teammates",
                      v: (selectedPitch.teammate_uniqnames || []).length
                        ? selectedPitch.teammate_uniqnames.join(", ")
                        : "None",
                    },
                    { l: "Schools", v: (selectedPitch.schools || []).join(", ") || "None" },
                    { l: "File", v: selectedPitch.file_name || "None" },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <p className="text-[10px] text-white/25 uppercase tracking-widest mb-0.5">{l}</p>
                      <p className="text-xs text-white/50 break-words">{v}</p>
                    </div>
                  ))}
                </div>
                {selectedPitch.tags?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedPitch.tags.map((tag) => (
                        <span key={tag.id} className="px-2 py-0.5 text-[11px] rounded-md font-medium"
                          style={{ background: "rgba(255,203,5,0.1)", color: "rgba(255,203,5,0.7)" }}>{tag.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Votes ({selectedPitch.vote_count || 0})</p>
                  {selectedPitch.votes?.length > 0 ? (
                    <div className="rounded-xl divide-y divide-white/[0.03]"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      {selectedPitch.votes.slice(0, 6).map((vote, idx) => (
                        <div key={`${vote.created_at}-${idx}`} className="px-3 py-1.5">
                          <p className="text-xs text-white/50 truncate">{vote.voter_name || vote.voter_email || "Unknown"}</p>
                          <p className="text-[10px] text-white/20">{new Date(vote.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                      {selectedPitch.votes.length > 6 && (
                        <div className="px-3 py-1.5"><p className="text-[10px] text-white/25">+{selectedPitch.votes.length - 6} more</p></div>
                      )}
                    </div>
                  ) : <p className="text-xs text-white/25">No votes yet.</p>}
                </div>
                <button onClick={() => setDeleteConfirm(selectedPitch.id)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                  style={{ border: "1px solid rgba(239,68,68,0.2)" }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete Pitch
                </button>
              </div>
            </div>

            </div>{/* end scrollable content */}
          </div>
        </div>
      )}

      {/* ═══ DELETE CONFIRM ═══ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "rgba(11,26,59,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Delete Pitch?</h3>
            <p className="text-sm text-white/40 mb-6">This permanently removes the pitch, its votes, tags, and files.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/70 transition-colors">Cancel</button>
              <button onClick={() => handleDeletePitch(deleteConfirm)} disabled={deletingPitchId === deleteConfirm}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50">
                {deletingPitchId === deleteConfirm ? "Deleting..." : "Delete Pitch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
