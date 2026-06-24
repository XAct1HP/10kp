"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../lib/AuthContext";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import MuxPlayer from "@mux/mux-player-react";

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
        style={{ background: "rgba(242,181,23,0.12)" }}>
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

const PITCHES_PER_PAGE = 10;
const VOTES_PER_PAGE = 12;

// ─── Main ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
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

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterType, setFilterType] = useState("");

  const [defaultThumbnails, setDefaultThumbnails] = useState({ audio: null, text: null });
  const [uploadingThumbnail, setUploadingThumbnail] = useState(null);

  const [deletingPitchId, setDeletingPitchId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("pitches");

  const [loadingState, setLoadingState] = useState({ date: true, pitches: true, tags: true, votes: true });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const timeLeft = useCountdown(competitionDate);
  const pad = (n) => String(n).padStart(2, "0");

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user && adminEmails.includes(user.email?.toLowerCase());

  useEffect(() => { if (!authLoading && (!user || !isAdmin)) router.push("/"); }, [authLoading, user, isAdmin, router]);

  // ── Filtered + paginated pitches ──
  const filteredPitches = useMemo(() => {
    let r = pitches;
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
  }, [pitches, searchQuery, filterTag, filterType]);

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
  const fetchDefThumb = useCallback(async () => { try { const d = await apiFetch("/api/admin/default-thumbnails"); setDefaultThumbnails({ audio: d.default_audio_thumbnail || null, text: d.default_text_thumbnail || null }); } catch {} }, []);

  useEffect(() => { if (user && isAdmin) { fetchDate(); fetchPitches(); fetchTags(); fetchVotes(); fetchDefThumb(); } }, [user, isAdmin, fetchDate, fetchPitches, fetchTags, fetchVotes, fetchDefThumb]);
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
  const handleExportCSV = () => {
    const rows = filteredPitches.map((p) => ({ Name: p.name, Title: p.title, Description: (p.description || "").replace(/[\n\r]+/g, " "), Role: p.role || "", Schools: (p.schools || []).join("; "), Tags: (p.tags || []).map((t) => t.name).join("; "), "File Type": p.file_type || "file", "File Name": p.file_name || "", Votes: p.vote_count || 0, "Submitted At": p.created_at ? new Date(p.created_at).toLocaleString() : "", "Mux Status": p.mux_status || "" }));
    if (!rows.length) { setError("No pitches to export."); return; }
    const h = Object.keys(rows[0]);
    const csv = [h.join(","), ...rows.map((r) => h.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const b = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `pitches_export_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(u); setSuccess("CSV exported.");
  };
  const handleUploadDefThumb = async (type, file) => {
    if (!file) return; setUploadingThumbnail(type); setError("");
    try { const fd = new FormData(); fd.append("file", file); fd.append("type", type); const d = await apiUpload("/api/admin/upload-thumbnail", fd); setDefaultThumbnails((p) => ({ ...p, [type]: d.url })); setSuccess(`Default ${type} thumbnail updated.`); } catch (e) { setError(e.message); } finally { setUploadingThumbnail(null); }
  };

  // ── Helpers ──
  const typeLabel = (p) => { if (p.file_type === "video") return "Video"; if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(p.file_name || "")) return "Audio"; if (p.text_content) return "Text"; return "File"; };
  const typeColor = (p) => { const t = typeLabel(p); if (t === "Video") return { bg: "rgba(99,102,241,0.15)", c: "#818cf8" }; if (t === "Audio") return { bg: "rgba(236,72,153,0.15)", c: "#f472b6" }; if (t === "Text") return { bg: "rgba(34,197,94,0.15)", c: "#4ade80" }; return { bg: "rgba(255,255,255,0.08)", c: "rgba(255,255,255,0.5)" }; };

  // ── Loading guard ──
  if (authLoading || !user || !isAdmin) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] bg-navy">
        <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
      </div>
    );
  }

  const totalVotes = pitches.reduce((s, p) => s + (p.vote_count || 0), 0);
  const tabs = [
    { id: "pitches", label: "Pitches", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
    { id: "tags", label: "Tags", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /> },
    { id: "votes", label: "Votes", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
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
    <div className="relative h-[calc(100vh-4rem)] overflow-hidden bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url('/admin_bg.png')" }}>
      {/* Overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(11,26,59,0.92) 0%, rgba(6,14,33,0.88) 50%, rgba(11,26,59,0.94) 100%)" }} />

      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <aside className="fixed top-16 left-0 bottom-0 w-56 z-30 hidden lg:flex flex-col"
        style={{ background: "rgba(6,14,33,0.7)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Brand */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(242,181,23,0.15)" }}>
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
                style={active ? { background: "rgba(242,181,23,0.1)" } : {}}>
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
              <div className="flex items-baseline justify-between">
                {[timeLeft.days, timeLeft.hours, timeLeft.minutes, timeLeft.seconds].map((value, i) => (
                  <span key={i} className="font-mono font-bold text-white text-lg leading-none">
                    {pad(value)}{i < 3 && <span className="text-maize/60 mx-0.5">:</span>}
                  </span>
                ))}
              </div>
            </>
          ) : competitionDate && timeLeft?.past ? (
            <p className="text-xs font-bold text-maize">Competition day is here!</p>
          ) : (
            <p className="text-[10px] text-white/25">No date set</p>
          )}
        </div>
      </aside>

      {/* ── MOBILE TAB BAR ──────────────────────────────────── */}
      <div className="lg:hidden fixed top-16 left-0 right-0 z-30 flex"
        style={{ background: "rgba(6,14,33,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors relative ${active ? "text-maize" : "text-white/35"}`}>
              {tab.label}
              {active && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-maize rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* ── MAIN CONTENT (no scroll) ────────────────────────── */}
      <main className="relative z-10 lg:ml-56 h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
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
            <div className="flex-1 flex flex-col min-h-0">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 flex-shrink-0">
                <StatCard label="Total Pitches" value={pitches.length} icon="📦" />
                <StatCard label="Total Votes" value={totalVotes} icon="👍" />
                <StatCard label="Videos" value={pitches.filter((p) => p.file_type === "video").length} icon="🎬" />
                <StatCard label="Tags" value={tags.length} icon="🏷️" />
              </div>

              {/* Toolbar */}
              <GlassCard className="mb-3 flex-shrink-0 !p-4">
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
                  <p className="text-xs text-white/30 mt-2">{filteredPitches.length} of {pitches.length} pitches{searchQuery && <span> matching &ldquo;{searchQuery}&rdquo;</span>}</p>
                )}
              </GlassCard>

              {/* Pitch list (fills remaining space) */}
              {loadingState.pitches ? (
                <div className="flex-1 flex items-center justify-center">
                  <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                </div>
              ) : filteredPitches.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-white/30 text-sm">{pitches.length === 0 ? "No pitches submitted yet." : "No pitches match your filters."}</p>
                </div>
              ) : (
                <GlassCard noPad className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 divide-y divide-white/[0.04]">
                    {paginatedPitches.map((pitch) => {
                      const tc = typeColor(pitch);
                      return (
                        <div key={pitch.id} className="flex items-center gap-4 px-5 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors group"
                          onClick={() => setSelectedPitch(pitch)}>
                          <span className="px-2.5 py-1 text-[11px] font-semibold rounded-lg uppercase tracking-wide flex-shrink-0"
                            style={{ background: tc.bg, color: tc.c }}>{typeLabel(pitch)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate group-hover:text-maize transition-colors">{pitch.title}</p>
                            <p className="text-xs text-white/35 truncate mt-0.5">{pitch.name} &middot; {pitch.role || "No role"}</p>
                          </div>
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
                  {pitchTotalPages > 1 && (
                    <div className="px-5 pb-3 flex-shrink-0">
                      <Paginator page={pitchPage} total={pitchTotalPages} onPrev={() => setPitchPage((p) => p - 1)} onNext={() => setPitchPage((p) => p + 1)} />
                    </div>
                  )}
                </GlassCard>
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
                      <span key={tag.id} className="inline-flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full text-sm font-medium" style={{ background: "rgba(242,181,23,0.1)", color: "#F2B517" }}>
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

          {/* ═══ SETTINGS ═══ */}
          {activeTab === "settings" && (
            <div className="space-y-4 flex-shrink-0">
              <GlassCard>
                <h2 className="text-lg font-bold text-white mb-4">Competition Date</h2>
                {loadingState.date ? <p className="text-white/30 text-sm">Loading...</p> : (
                  <>
                    {competitionDate && !editingDate && (
                      <p className="text-sm text-white/50 mb-4">Scheduled for <span className="text-maize font-medium">{new Date(competitionDate).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</span></p>
                    )}
                    {editingDate ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input type="datetime-local" value={dateInput} onChange={(e) => setDateInput(e.target.value)}
                          className="px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-maize/40"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                        <button onClick={handleSaveDate} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors">Save</button>
                        <button onClick={() => setEditingDate(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/70 transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingDate(true)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white/70 transition-colors" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>{competitionDate ? "Edit Date" : "Set Date"}</button>
                    )}
                  </>
                )}
              </GlassCard>
              <GlassCard>
                <h2 className="text-lg font-bold text-white mb-1">Default Thumbnails</h2>
                <p className="text-sm text-white/35 mb-5">Fallback images for audio and text pitches.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {[{ type: "audio", label: "Audio Pitch" }, { type: "text", label: "Text Pitch" }].map(({ type, label }) => (
                    <div key={type}>
                      <p className="text-sm font-semibold text-white/60 mb-2">{label}</p>
                      {defaultThumbnails[type] ? (
                        <div className="relative group rounded-xl overflow-hidden">
                          <img src={defaultThumbnails[type]} alt={label} className="w-full aspect-video object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <label className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/20 hover:bg-white/30 cursor-pointer transition-colors">
                              Replace<input type="file" accept="image/*" className="sr-only" onChange={(e) => handleUploadDefThumb(type, e.target.files[0])} />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full aspect-video rounded-xl cursor-pointer transition-colors hover:bg-white/[0.03]" style={{ border: "2px dashed rgba(255,255,255,0.08)" }}>
                          {uploadingThumbnail === type ? (
                            <svg className="animate-spin h-5 w-5 text-maize" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <>
                              <svg className="w-7 h-7 text-white/15 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <span className="text-xs text-white/25">Upload image</span>
                            </>
                          )}
                          <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleUploadDefThumb(type, e.target.files[0])} />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          )}
        </div>
      </main>

      {/* ═══ PITCH DETAIL MODAL (viewport-fitted, no scroll) ═══ */}
      {selectedPitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-6"
          onClick={() => setSelectedPitch(null)}>
          <div className="w-full max-w-5xl max-h-full flex flex-col rounded-2xl overflow-hidden"
            style={{ background: "rgba(11,26,59,0.94)", backdropFilter: "blur(32px)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-3 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="px-2.5 py-1 text-[11px] font-semibold rounded-lg uppercase tracking-wide"
                    style={{ background: typeColor(selectedPitch).bg, color: typeColor(selectedPitch).c }}>{typeLabel(selectedPitch)}</span>
                  {selectedPitch.file_type === "video" && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${selectedPitch.mux_playback_id ? "bg-green-500/10 text-green-400" : selectedPitch.mux_error ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {selectedPitch.mux_playback_id ? "ready" : selectedPitch.mux_error ? "error" : selectedPitch.mux_status || "pending"}
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

            {/* Body — flex row, no scroll */}
            <div className="flex-1 flex min-h-0 px-7 pb-6 gap-6">
              {/* Left: media + description */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {selectedPitch.file_type === "video" && selectedPitch.mux_playback_id && (
                  <div className="rounded-xl overflow-hidden flex-shrink-0 mb-4" style={{ maxHeight: "45vh" }}>
                    <MuxPlayer playbackId={selectedPitch.mux_playback_id} accentColor="#F2B517" style={{ width: "100%", maxHeight: "45vh" }} />
                  </div>
                )}
                {selectedPitch.file_type === "video" && !selectedPitch.mux_playback_id && (
                  <div className="mb-4 flex items-center justify-center h-32 rounded-xl flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className={`text-sm ${selectedPitch.mux_error ? "text-red-400" : "text-white/30"}`}>{selectedPitch.mux_error || `Video is ${selectedPitch.mux_status || "processing"}...`}</p>
                  </div>
                )}
                {selectedPitch.thumbnail_path && !selectedPitch.mux_playback_id && (
                  <div className="mb-4 flex-shrink-0">
                    <img src={selectedPitch.thumbnail_path} alt="Thumbnail" className="max-h-32 rounded-xl object-cover" style={{ border: "1px solid rgba(255,255,255,0.08)" }} />
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Description</p>
                  <p className="text-sm text-white/60 leading-relaxed line-clamp-6">{selectedPitch.description}</p>
                </div>
                {selectedPitch.text_content && (
                  <div className="mt-3 flex-shrink-0">
                    <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Pitch Text</p>
                    <div className="rounded-xl p-3 text-sm text-white/50 leading-relaxed line-clamp-4"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>{selectedPitch.text_content}</div>
                  </div>
                )}
              </div>

              {/* Right sidebar */}
              <div className="w-64 flex-shrink-0 flex flex-col min-h-0 space-y-4">
                <div className="space-y-3 flex-shrink-0">
                  {[
                    { l: "Schools", v: (selectedPitch.schools || []).join(", ") || "None" },
                    { l: "File", v: selectedPitch.file_name || "None" },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <p className="text-[10px] text-white/25 uppercase tracking-widest mb-0.5">{l}</p>
                      <p className="text-xs text-white/50 truncate">{v}</p>
                    </div>
                  ))}
                </div>
                {selectedPitch.tags?.length > 0 && (
                  <div className="flex-shrink-0">
                    <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedPitch.tags.map((tag) => (
                        <span key={tag.id} className="px-2 py-0.5 text-[11px] rounded-md font-medium"
                          style={{ background: "rgba(242,181,23,0.1)", color: "rgba(242,181,23,0.7)" }}>{tag.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0 flex flex-col">
                  <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5 flex-shrink-0">Votes ({selectedPitch.vote_count || 0})</p>
                  {selectedPitch.votes?.length > 0 ? (
                    <div className="flex-1 min-h-0 overflow-hidden rounded-xl divide-y divide-white/[0.03]"
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
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 flex-shrink-0"
                  style={{ border: "1px solid rgba(239,68,68,0.2)" }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete Pitch
                </button>
              </div>
            </div>
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
