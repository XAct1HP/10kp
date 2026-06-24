"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../lib/AuthContext";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import MuxPlayer from "@mux/mux-player-react";
import CountdownTimer from "../../components/CountdownTimer";

// Helper to get the current user's access token for API calls
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
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function apiUpload(url, formData) {
  const token = await getToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

// ── Main Admin Page ────────────────────────────────────────────────
export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [competitionDate, setCompetitionDate] = useState(null);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");

  const [pitches, setPitches] = useState([]);
  const [expandedPitch, setExpandedPitch] = useState(null);

  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState("");

  const [votes, setVotes] = useState([]);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterType, setFilterType] = useState("");

  // Default thumbnail state
  const [defaultThumbnails, setDefaultThumbnails] = useState({
    audio: null,
    text: null,
  });
  const [uploadingThumbnail, setUploadingThumbnail] = useState(null);

  // Delete confirmation
  const [deletingPitchId, setDeletingPitchId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Active tab
  const [activeTab, setActiveTab] = useState("pitches");

  const [loadingState, setLoadingState] = useState({
    date: true,
    pitches: true,
    tags: true,
    votes: true,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Check admin access
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = user && adminEmails.includes(user.email?.toLowerCase());

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/");
    }
  }, [authLoading, user, isAdmin, router]);

  // Filtered pitches
  const filteredPitches = useMemo(() => {
    let result = pitches;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }
    if (filterTag) {
      result = result.filter((p) =>
        p.tags?.some((t) => t.id === filterTag)
      );
    }
    if (filterType) {
      if (filterType === "video") {
        result = result.filter((p) => p.file_type === "video");
      } else if (filterType === "text") {
        result = result.filter(
          (p) =>
            p.file_type === "file" &&
            (p.text_content ||
              /\.(txt|pdf|doc|docx)$/i.test(p.file_name || ""))
        );
      } else if (filterType === "audio") {
        result = result.filter(
          (p) =>
            p.file_type === "file" &&
            /\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(p.file_name || "")
        );
      }
    }
    return result;
  }, [pitches, searchQuery, filterTag, filterType]);

  // Fetch data
  const fetchDate = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/competition-date");
      setCompetitionDate(data.competition_date);
      if (data.competition_date) {
        const d = new Date(data.competition_date);
        setDateInput(toLocalDatetimeString(d));
      }
    } catch {
      // No date set yet
    } finally {
      setLoadingState((s) => ({ ...s, date: false }));
    }
  }, []);

  const fetchPitches = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/pitches");
      setPitches(data);
    } catch {
      // ignore
    } finally {
      setLoadingState((s) => ({ ...s, pitches: false }));
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/tags");
      setTags(data);
    } catch {
      // ignore
    } finally {
      setLoadingState((s) => ({ ...s, tags: false }));
    }
  }, []);

  const fetchVotes = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/votes");
      setVotes(data);
    } catch {
      // ignore
    } finally {
      setLoadingState((s) => ({ ...s, votes: false }));
    }
  }, []);

  const fetchDefaultThumbnails = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/default-thumbnails");
      setDefaultThumbnails({
        audio: data.default_audio_thumbnail || null,
        text: data.default_text_thumbnail || null,
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchDate();
      fetchPitches();
      fetchTags();
      fetchVotes();
      fetchDefaultThumbnails();
    }
  }, [user, isAdmin, fetchDate, fetchPitches, fetchTags, fetchVotes, fetchDefaultThumbnails]);

  // Auto-clear success message
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(""), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // Handlers
  const handleSaveDate = async () => {
    setError("");
    if (!dateInput) return;
    try {
      const data = await apiFetch("/api/admin/competition-date", {
        method: "PUT",
        body: JSON.stringify({
          competition_date: new Date(dateInput).toISOString(),
        }),
      });
      setCompetitionDate(data.competition_date);
      setEditingDate(false);
      setSuccess("Competition date updated.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    setError("");
    if (!newTagName.trim()) return;
    try {
      await apiFetch("/api/admin/tags", {
        method: "POST",
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      setNewTagName("");
      fetchTags();
      setSuccess("Tag created.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteTag = async (id) => {
    setError("");
    try {
      await apiFetch(`/api/admin/tags?id=${id}`, { method: "DELETE" });
      fetchTags();
      setSuccess("Tag deleted.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePitch = async (pitchId) => {
    setError("");
    setDeletingPitchId(pitchId);
    try {
      await apiFetch(`/api/admin/pitches?id=${pitchId}`, { method: "DELETE" });
      setPitches((prev) => prev.filter((p) => p.id !== pitchId));
      setDeleteConfirm(null);
      if (expandedPitch === pitchId) setExpandedPitch(null);
      setSuccess("Pitch removed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingPitchId(null);
    }
  };

  const handleExportCSV = () => {
    const rows = filteredPitches.map((p) => ({
      Name: p.name,
      Title: p.title,
      Description: (p.description || "").replace(/[\n\r]+/g, " "),
      Role: p.role || "",
      Schools: (p.schools || []).join("; "),
      Tags: (p.tags || []).map((t) => t.name).join("; "),
      "File Type": p.file_type || "file",
      "File Name": p.file_name || "",
      Votes: p.vote_count || 0,
      "Submitted At": p.created_at
        ? new Date(p.created_at).toLocaleString()
        : "",
      "Mux Status": p.mux_status || "",
    }));

    if (rows.length === 0) {
      setError("No pitches to export.");
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = String(row[h] ?? "");
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pitches_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSuccess("CSV exported.");
  };

  const handleUploadDefaultThumbnail = async (type, file) => {
    if (!file) return;
    setUploadingThumbnail(type);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const data = await apiUpload("/api/admin/upload-thumbnail", formData);
      setDefaultThumbnails((prev) => ({ ...prev, [type]: data.url }));
      setSuccess(`Default ${type} thumbnail updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingThumbnail(null);
    }
  };

  // Loading / auth guard
  if (authLoading || !user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-navy">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-maize" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-white/60 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "pitches", label: "Pitches", count: pitches.length },
    { id: "tags", label: "Tags", count: tags.length },
    { id: "votes", label: "Votes", count: votes.length },
    { id: "settings", label: "Settings" },
  ];

  const getPitchTypeIcon = (pitch) => {
    if (pitch.file_type === "video") return "🎬";
    if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(pitch.file_name || "")) return "🎙️";
    if (pitch.text_content) return "📝";
    return "📄";
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-navy">
      {/* Header */}
      <div className="mx-auto max-w-7xl px-5 pt-10 pb-6 md:px-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
              Admin <span className="text-maize">Dashboard</span>
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Manage pitches, tags, votes, and competition settings.
            </p>
          </div>
          <CountdownTimer targetDate={competitionDate} />
        </div>
      </div>

      {/* Notifications */}
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        {error && (
          <div className="mb-4 flex items-center gap-3 rounded-xl p-4 text-sm"
            style={{ background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-300">{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-3 rounded-xl p-4 text-sm"
            style={{ background: "rgba(34, 197, 94, 0.12)", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-300">{success}</span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <div className="flex gap-1 border-b border-white/10 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-semibold transition-all relative ${
                activeTab === tab.id
                  ? "text-maize"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? "bg-maize/20 text-maize"
                    : "bg-white/10 text-white/40"
                }`}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-maize rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="mx-auto max-w-7xl px-5 pb-12 md:px-10">
        {/* ── PITCHES TAB ─────────────────────────────────────── */}
        {activeTab === "pitches" && (
          <div className="space-y-4">
            {/* Search / Filter / Export bar */}
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, title, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-maize/50"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>

              {/* Tag filter */}
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="px-4 py-3 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-maize/50 appearance-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <option value="">All Tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>

              {/* Type filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-3 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-maize/50 appearance-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <option value="">All Types</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="text">Text / Document</option>
              </select>

              {/* Export button */}
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            </div>

            {/* Results count */}
            {(searchQuery || filterTag || filterType) && (
              <p className="text-xs text-white/40">
                Showing {filteredPitches.length} of {pitches.length} pitches
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            )}

            {/* Pitches list */}
            {loadingState.pitches ? (
              <div className="py-12 text-center">
                <svg className="animate-spin h-6 w-6 mx-auto text-maize mb-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-white/40 text-sm">Loading pitches...</p>
              </div>
            ) : filteredPitches.length === 0 ? (
              <div className="py-12 text-center rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white/40 text-sm">
                  {pitches.length === 0 ? "No pitches submitted yet." : "No pitches match your filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPitches.map((pitch) => {
                  const isExpanded = expandedPitch === pitch.id;
                  const isVideo = (pitch.file_type || "file") === "video";
                  const canPlayVideo = Boolean(pitch.mux_playback_id);

                  return (
                    <div key={pitch.id} className="rounded-xl overflow-hidden transition-all"
                      style={{ background: isExpanded ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {/* Pitch row */}
                      <div
                        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                        onClick={() => setExpandedPitch(isExpanded ? null : pitch.id)}
                      >
                        {/* Type icon */}
                        <span className="text-lg flex-shrink-0">{getPitchTypeIcon(pitch)}</span>

                        {/* Name & title */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{pitch.title}</p>
                          <p className="text-xs text-white/40 truncate">by {pitch.name}</p>
                        </div>

                        {/* Tags */}
                        <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                          {pitch.tags?.map((tag) => (
                            <span key={tag.id} className="px-2 py-0.5 text-xs rounded-full bg-maize/15 text-maize/80">
                              {tag.name}
                            </span>
                          ))}
                        </div>

                        {/* Status badge for video */}
                        {isVideo && (
                          <span className={`hidden sm:inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                            pitch.mux_playback_id
                              ? "bg-green-500/15 text-green-400"
                              : pitch.mux_error
                                ? "bg-red-500/15 text-red-400"
                                : "bg-yellow-500/15 text-yellow-400"
                          }`}>
                            {pitch.mux_playback_id ? "ready" : pitch.mux_error ? "error" : pitch.mux_status || "pending"}
                          </span>
                        )}

                        {/* Vote count */}
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-white/60">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017a2 2 0 01-.95-.24l-3.296-1.884A2 2 0 016 17.117V13a2 2 0 012-2h1.586a1 1 0 00.707-.293l2.414-2.414a1 1 0 00.293-.707V6a2 2 0 012-2h.09a1.65 1.65 0 011.561 1.098l.146.438A3 3 0 0114 7.67V10z" />
                          </svg>
                          <span className="text-xs font-semibold">{pitch.vote_count || 0}</span>
                        </div>

                        {/* Date */}
                        <span className="hidden lg:block text-xs text-white/30 whitespace-nowrap">
                          {new Date(pitch.created_at).toLocaleDateString()}
                        </span>

                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(pitch.id);
                          }}
                          className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete pitch"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>

                        {/* Expand chevron */}
                        <svg className={`w-4 h-4 text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-1 border-t border-white/5">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                            {/* Left column - details */}
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Description</p>
                                <p className="text-sm text-white/70 whitespace-pre-wrap">{pitch.description}</p>
                              </div>

                              {pitch.text_content && (
                                <div>
                                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Text Content</p>
                                  <div className="max-h-40 overflow-auto rounded-lg p-3 text-sm text-white/60"
                                    style={{ background: "rgba(255,255,255,0.03)" }}>
                                    {pitch.text_content}
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Role</p>
                                  <p className="text-white/70">{pitch.role || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Schools</p>
                                  <p className="text-white/70">{(pitch.schools || []).join(", ") || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">File</p>
                                  <p className="text-white/70">{pitch.file_name || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Submitted</p>
                                  <p className="text-white/70">{new Date(pitch.created_at).toLocaleString()}</p>
                                </div>
                              </div>

                              {/* Votes audit */}
                              <div>
                                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                                  Votes ({pitch.vote_count || 0})
                                </p>
                                {pitch.votes?.length > 0 ? (
                                  <div className="max-h-44 overflow-auto rounded-lg"
                                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                    <table className="w-full text-sm">
                                      <thead className="sticky top-0 text-xs uppercase text-white/30"
                                        style={{ background: "rgba(11,26,59,0.95)" }}>
                                        <tr>
                                          <th className="text-left px-3 py-2">Voter</th>
                                          <th className="text-left px-3 py-2">Time</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-white/5">
                                        {pitch.votes.map((vote, idx) => (
                                          <tr key={`${vote.created_at}-${idx}`}>
                                            <td className="px-3 py-2 text-white/60">
                                              {vote.voter_name
                                                ? `${vote.voter_name} (${vote.voter_email || ""})`
                                                : vote.voter_email || "Unknown"}
                                            </td>
                                            <td className="px-3 py-2 text-white/40">
                                              {new Date(vote.created_at).toLocaleString()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="text-sm text-white/30">No votes yet.</p>
                                )}
                              </div>
                            </div>

                            {/* Right column - media preview */}
                            <div>
                              {isVideo && (
                                <>
                                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Video Preview</p>
                                  {canPlayVideo ? (
                                    <MuxPlayer
                                      playbackId={pitch.mux_playback_id}
                                      accentColor="#F2B517"
                                      style={{ width: "100%", borderRadius: "0.75rem", overflow: "hidden" }}
                                    />
                                  ) : (
                                    <div className="flex items-center justify-center h-48 rounded-xl"
                                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                      <p className={`text-sm ${pitch.mux_error ? "text-red-400" : "text-white/40"}`}>
                                        {pitch.mux_error || `Video is ${pitch.mux_status || "processing"}...`}
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}

                              {pitch.thumbnail_path && (
                                <div className="mt-4">
                                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Custom Thumbnail</p>
                                  <img
                                    src={pitch.thumbnail_path}
                                    alt="Custom thumbnail"
                                    className="w-full max-w-xs rounded-xl object-cover"
                                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAGS TAB ────────────────────────────────────────── */}
        {activeTab === "tags" && (
          <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="text-lg font-bold text-white mb-4">Manage Tags</h2>

            {loadingState.tags ? (
              <p className="text-white/40 text-sm">Loading...</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-6">
                  {tags.length === 0 ? (
                    <p className="text-white/40 text-sm">No tags created yet.</p>
                  ) : (
                    tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-maize/15 text-maize"
                      >
                        {tag.name}
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          className="text-maize/50 hover:text-red-400 transition-colors"
                          title="Delete tag"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <form onSubmit={handleCreateTag} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New tag name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-maize/50"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  <button
                    type="submit"
                    className="px-5 py-3 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors"
                  >
                    Add Tag
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {/* ── VOTES TAB ───────────────────────────────────────── */}
        {activeTab === "votes" && (
          <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="text-lg font-bold text-white mb-4">Votes Audit Trail</h2>

            {loadingState.votes ? (
              <p className="text-white/40 text-sm">Loading...</p>
            ) : votes.length === 0 ? (
              <p className="text-white/40 text-sm">No votes recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-white/30 border-b border-white/5">
                    <tr>
                      <th className="text-left px-4 py-3">Voter</th>
                      <th className="text-left px-4 py-3">Pitch</th>
                      <th className="text-left px-4 py-3">Submitter</th>
                      <th className="text-left px-4 py-3">Voted At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {votes.map((vote) => (
                      <tr key={vote.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-white/60">
                          {vote.voter_name
                            ? `${vote.voter_name} (${vote.voter_email || ""})`
                            : vote.voter_email || vote.user_id || "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{vote.pitch_title}</td>
                        <td className="px-4 py-3 text-white/50">{vote.pitch_submitter}</td>
                        <td className="px-4 py-3 text-white/40">{new Date(vote.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* Competition Date */}
            <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 className="text-lg font-bold text-white mb-4">Competition Date</h2>

              {loadingState.date ? (
                <p className="text-white/40 text-sm">Loading...</p>
              ) : (
                <>
                  {competitionDate && !editingDate && (
                    <p className="text-sm text-white/50 mb-3">
                      Scheduled for{" "}
                      <span className="text-maize font-medium">
                        {new Date(competitionDate).toLocaleString(undefined, {
                          dateStyle: "full",
                          timeStyle: "short",
                        })}
                      </span>
                    </p>
                  )}

                  {editingDate ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        type="datetime-local"
                        value={dateInput}
                        onChange={(e) => setDateInput(e.target.value)}
                        className="px-4 py-3 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-maize/50"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveDate}
                          className="px-5 py-3 rounded-xl text-sm font-semibold text-navy bg-maize hover:bg-yellow-400 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDate(false)}
                          className="px-5 py-3 rounded-xl text-sm font-medium text-white/50 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingDate(true)}
                      className="px-5 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white transition-colors"
                      style={{ border: "1px solid rgba(255,255,255,0.15)" }}
                    >
                      {competitionDate ? "Edit Date" : "Set Date"}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Default Thumbnails */}
            <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 className="text-lg font-bold text-white mb-1">Default Thumbnails</h2>
              <p className="text-sm text-white/40 mb-6">
                Set fallback thumbnails for audio and text pitches that don&apos;t have a custom thumbnail.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Audio thumbnail */}
                <div>
                  <p className="text-sm font-semibold text-white/70 mb-3">Audio Pitch Default</p>
                  {defaultThumbnails.audio ? (
                    <div className="relative group">
                      <img
                        src={defaultThumbnails.audio}
                        alt="Default audio thumbnail"
                        className="w-full aspect-video rounded-xl object-cover"
                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <label className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/20 hover:bg-white/30 cursor-pointer transition-colors">
                          Replace
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => handleUploadDefaultThumbnail("audio", e.target.files[0])}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label
                      className="flex flex-col items-center justify-center w-full aspect-video rounded-xl cursor-pointer transition-colors hover:bg-white/[0.04]"
                      style={{ border: "2px dashed rgba(255,255,255,0.12)" }}
                    >
                      {uploadingThumbnail === "audio" ? (
                        <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <>
                          <svg className="w-8 h-8 text-white/20 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs text-white/30">Upload image</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => handleUploadDefaultThumbnail("audio", e.target.files[0])}
                      />
                    </label>
                  )}
                </div>

                {/* Text thumbnail */}
                <div>
                  <p className="text-sm font-semibold text-white/70 mb-3">Text Pitch Default</p>
                  {defaultThumbnails.text ? (
                    <div className="relative group">
                      <img
                        src={defaultThumbnails.text}
                        alt="Default text thumbnail"
                        className="w-full aspect-video rounded-xl object-cover"
                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <label className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/20 hover:bg-white/30 cursor-pointer transition-colors">
                          Replace
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => handleUploadDefaultThumbnail("text", e.target.files[0])}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label
                      className="flex flex-col items-center justify-center w-full aspect-video rounded-xl cursor-pointer transition-colors hover:bg-white/[0.04]"
                      style={{ border: "2px dashed rgba(255,255,255,0.12)" }}
                    >
                      {uploadingThumbnail === "text" ? (
                        <svg className="animate-spin h-6 w-6 text-maize" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <>
                          <svg className="w-8 h-8 text-white/20 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs text-white/30">Upload image</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => handleUploadDefaultThumbnail("text", e.target.files[0])}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setDeleteConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ background: "#0f2347", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Delete Pitch?</h3>
            <p className="text-sm text-white/50 mb-6">
              This will permanently remove this pitch, its votes, tags, and any uploaded files. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeletePitch(deleteConfirm)}
                disabled={deletingPitchId === deleteConfirm}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {deletingPitchId === deleteConfirm ? "Deleting..." : "Delete Pitch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Format a Date to "YYYY-MM-DDTHH:MM" for the datetime-local input
function toLocalDatetimeString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}
