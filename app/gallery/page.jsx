"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import MuxPlayer from "@mux/mux-player-react";

const GALLERY_PAGE_SIZE = 200;
const CARDS_PER_PAGE = 36; // 6 cols x 6 rows on desktop; wraps naturally on smaller screens
const TOP_COUNT = 3;

const RANK_BADGES = [
  { label: "1ST PLACE", short: "1ST", gradient: "linear-gradient(135deg, #F2B517 0%, #FFD876 50%, #F2B517 100%)", shadow: "0 0 28px rgba(242,181,23,0.6)", textColor: "#0B1A3B", ring: "rgba(242,181,23,0.4)" },
  { label: "2ND PLACE", short: "2ND", gradient: "linear-gradient(135deg, #C0C0C0 0%, #E8E8E8 50%, #A8A8A8 100%)", shadow: "0 0 20px rgba(192,192,192,0.35)", textColor: "#1a1a2e", ring: "rgba(192,192,192,0.3)" },
  { label: "3RD PLACE", short: "3RD", gradient: "linear-gradient(135deg, #CD7F32 0%, #E8A84C 50%, #CD7F32 100%)", shadow: "0 0 18px rgba(205,127,50,0.35)", textColor: "#1a1a2e", ring: "rgba(205,127,50,0.3)" },
];

export default function GalleryPage() {
  const { user } = useAuth();

  const [allSubmissions, setAllSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [galleryPage, setGalleryPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const [voting, setVoting] = useState({ maxVotesPerUser: 5, userVoteCount: 0, remainingVotes: 5 });
  const [voteSubmitting, setVoteSubmitting] = useState({});
  const [selectedPitch, setSelectedPitch] = useState(null);
  const [extractedText, setExtractedText] = useState(null);
  const [extractingText, setExtractingText] = useState(false);

  const [voterProfile, setVoterProfile] = useState({ name: "", email: "" });
  const [showVoterModal, setShowVoterModal] = useState(false);
  const [pendingPitchId, setPendingPitchId] = useState(null);
  const [voterForm, setVoterForm] = useState({ name: "", email: "" });

  const [defaultThumbnails, setDefaultThumbnails] = useState({ audioThumbnail: null, textThumbnail: null });

  const [pulsingVoteIds, setPulsingVoteIds] = useState([]);
  const previousVotesRef = useRef({});

  const [shuffleSeed] = useState(() => Math.random());

  // ── Auto-fill voter from auth ──
  useEffect(() => {
    if (user?.email) {
      setVoterProfile({ name: user.email.split("@")[0], email: user.email.toLowerCase() });
    } else if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem("gallery_voter_profile") || "null");
        if (saved?.name && saved?.email) setVoterProfile({ name: saved.name, email: saved.email.toLowerCase() });
      } catch {}
    }
  }, [user]);

  // ── Fetch submissions ──
  const fetchSubmissions = async () => {
    try {
      const params = new URLSearchParams({ page: "1", pageSize: String(GALLERY_PAGE_SIZE) });
      if (voterProfile.email) params.set("voterEmail", voterProfile.email);
      const res = await fetch(`/api/gallery/submissions?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setAllSubmissions(data.submissions || []);
      setVoting(data.voting || { maxVotesPerUser: 5, userVoteCount: 0, remainingVotes: 5 });
      if (data.defaults) setDefaultThumbnails(data.defaults);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubmissions(); }, [voterProfile.email]);

  // Extract text from document files when a pitch is selected
  useEffect(() => {
    setExtractedText(null);
    setExtractingText(false);
    if (!selectedPitch?.file_path) return;
    if (!/\.(pdf|doc|docx|txt)$/i.test(selectedPitch.file_name || "")) return;
    setExtractingText(true);
    fetch(`/api/gallery/extract-text?path=${encodeURIComponent(selectedPitch.file_path)}&name=${encodeURIComponent(selectedPitch.file_name || "")}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.text) setExtractedText(d.text);
        else if (d.error) console.error("extract-text API error:", d.error);
      })
      .catch((err) => console.error("extract-text fetch error:", err))
      .finally(() => setExtractingText(false));
  }, [selectedPitch?.id]);

  useEffect(() => {
    if (loading) return;
    const id = setInterval(fetchSubmissions, 15000);
    return () => clearInterval(id);
  }, [loading, voterProfile.email]);

  // Pulse animation on vote changes
  useEffect(() => {
    if (!allSubmissions.length) return;
    const changed = allSubmissions.filter((p) => {
      const prev = previousVotesRef.current[p.id];
      return prev !== undefined && prev !== (p.vote_count || 0);
    }).map((p) => p.id);
    previousVotesRef.current = Object.fromEntries(allSubmissions.map((p) => [p.id, p.vote_count || 0]));
    if (!changed.length) return;
    setPulsingVoteIds(changed);
    const t = setTimeout(() => setPulsingVoteIds([]), 1600);
    return () => clearTimeout(t);
  }, [allSubmissions]);

  useEffect(() => {
    if (!selectedPitch) return;
    const updated = allSubmissions.find((p) => p.id === selectedPitch.id);
    if (updated) setSelectedPitch(updated);
  }, [allSubmissions]);

  const filteredSubmissions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allSubmissions;

    return allSubmissions.filter((pitch) => {
      const title = (pitch.title || "").toLowerCase();
      const name = (pitch.name || "").toLowerCase();
      const description = (pitch.description || "").toLowerCase();
      const textContent = (pitch.text_content || "").toLowerCase();
      const fileName = (pitch.file_name || "").toLowerCase();
      const tags = (pitch.tags || [])
        .map((tag) => (tag?.name || "").toLowerCase())
        .join(" ");

      return (
        title.includes(query) ||
        name.includes(query) ||
        description.includes(query) ||
        textContent.includes(query) ||
        fileName.includes(query) ||
        tags.includes(query)
      );
    });
  }, [allSubmissions, searchQuery]);

  useEffect(() => {
    setGalleryPage(1);
  }, [searchQuery]);

  // ── Top 3 by votes (constant, independent of search) ──
  const topPitches = useMemo(
    () =>
      [...allSubmissions]
        .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
        .slice(0, TOP_COUNT),
    [allSubmissions]
  );

  // ── Searchable gallery list (all submissions; filtered when searching) ──
  const shuffledGallery = useMemo(() => {
    const arr = [...filteredSubmissions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor((shuffleSeed * (i + 1) * 9301 + 49297) % arr.length);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [filteredSubmissions, shuffleSeed]);

  const totalGalleryPages = Math.max(1, Math.ceil(shuffledGallery.length / CARDS_PER_PAGE));
  const paginatedGallery = shuffledGallery.slice((galleryPage - 1) * CARDS_PER_PAGE, galleryPage * CARDS_PER_PAGE);

  // ── Helpers ──
  const getThumbnail = (pitch) => {
    if (pitch.thumbnail_path) return pitch.thumbnail_path;
    if (pitch.mux_playback_id) return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1&width=640&height=360&fit_mode=smartcrop`;
    if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(pitch.file_name || "")) return defaultThumbnails.audioThumbnail || "/placeholder.png";
    if (pitch.text_content || /\.(txt|pdf|doc|docx)$/i.test(pitch.file_name || "")) return defaultThumbnails.textThumbnail || "/placeholder.png";
    return "/placeholder.png";
  };

  const getPitchType = (p) => {
    if (p.file_type === "video" || p.mux_playback_id) return "video";
    if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(p.file_name || "")) return "audio";
    return "text";
  };

  // ── Voting ──
  const submitVoteRequest = async (pitchId, profile) => {
    const target = allSubmissions.find((p) => p.id === pitchId);
    const isUnvote = Boolean(target?.user_has_voted);
    setVoteSubmitting((prev) => ({ ...prev, [pitchId]: true }));
    setError("");
    try {
      const res = await fetch("/api/gallery/votes", {
        method: isUnvote ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchId, voterName: profile.name, voterEmail: profile.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cast vote.");
      setAllSubmissions((prev) => prev.map((p) => p.id === pitchId ? { ...p, vote_count: data.pitchVoteCount, user_has_voted: data.action === "voted" } : p));
      setVoting({ maxVotesPerUser: data.maxVotesPerUser, userVoteCount: data.userVoteCount, remainingVotes: data.remainingVotes });
    } catch (err) {
      setError(err.message);
    } finally {
      setVoteSubmitting((prev) => ({ ...prev, [pitchId]: false }));
    }
  };

  const handleVote = async (pitchId) => {
    if (!voterProfile.email || !voterProfile.name) {
      setPendingPitchId(pitchId);
      setVoterForm({ name: "", email: "" });
      setShowVoterModal(true);
      return;
    }
    await submitVoteRequest(pitchId, voterProfile);
  };

  const handleSaveVoterProfile = async (e) => {
    e.preventDefault();
    const name = voterForm.name.trim();
    const email = voterForm.email.trim().toLowerCase();
    if (!name) { setError("Please enter your name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email."); return; }
    const profile = { name, email };
    setVoterProfile(profile);
    if (typeof window !== "undefined") localStorage.setItem("gallery_voter_profile", JSON.stringify(profile));
    setShowVoterModal(false);
    if (pendingPitchId) {
      const pid = pendingPitchId;
      setPendingPitchId(null);
      await submitVoteRequest(pid, profile);
    }
  };

  // ═══════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes heroFloat {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .gallery-scroll::-webkit-scrollbar { width: 8px; }
        .gallery-scroll::-webkit-scrollbar-track { background: #060810; }
        .gallery-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
        .gallery-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .gallery-scroll { scrollbar-color: rgba(255,255,255,0.12) #060810; scrollbar-width: thin; }
      ` }} />

      <div className="h-[calc(100vh-5rem)] overflow-y-auto flex flex-col gallery-scroll"
        style={{ background: "#060810" }}>

        {/* Navbar separator — maize gradient line */}
        <div className="h-px w-full flex-shrink-0"
          style={{ background: "linear-gradient(90deg, transparent, rgba(242,181,23,0.25) 30%, rgba(242,181,23,0.4) 50%, rgba(242,181,23,0.25) 70%, transparent)" }} />

        {/* ═══════════════════════════════════════
             HERO — background image, landing-page style
            ═══════════════════════════════════════ */}
        <div className="relative flex-shrink-0 overflow-hidden"
          style={{ height: "clamp(130px, 18vh, 190px)" }}>
          {/* Background image */}
          <div className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/gallery_hero.png')" }} />
          {/* Gradient overlay matching landing page */}
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.25) 40%, rgba(6,8,16,0.85) 85%, rgba(6,8,16,1) 100%)" }} />
          {/* Ambient maize glow */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[200px] pointer-events-none"
            style={{ background: "radial-gradient(ellipse, rgba(242,181,23,0.06) 0%, transparent 70%)", animation: "heroFloat 6s ease-in-out infinite" }} />

          {/* Hero content */}
          <div className="absolute inset-0 flex items-start justify-between gap-3 px-4 sm:px-10 lg:px-14 pt-5 sm:pt-6">
            {/* Left: label + title stacked */}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] font-semibold mb-1.5"
                style={{ color: "#F2B517" }}>
                10KP Competition
              </p>
              <h1 className="font-black text-white tracking-tight leading-[1.05]"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}>
                The <span style={{ color: "#F2B517" }}>Pitch</span> Gallery
              </h1>
            </div>
            {/* Right: votes */}
            <div className="flex-shrink-0 pt-0.5">
              {voterProfile.email ? (
                <div className="flex items-center gap-1.5 sm:gap-2.5 rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5"
                  style={{ background: "rgba(242,181,23,0.08)", border: "1px solid rgba(242,181,23,0.15)", backdropFilter: "blur(12px)" }}>
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="#F2B517" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  <span className="text-xs sm:text-sm font-black" style={{ color: "#F2B517" }}>{voting.remainingVotes}</span>
                  <span className="hidden sm:inline text-[11px] text-white/30">votes left</span>
                </div>
              ) : (
                <p className="text-[11px] text-white/20 hidden sm:block">Click a pitch to vote</p>
              )}
            </div>
            </div>
          </div>

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-8 w-8 text-[#F2B517]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span className="text-sm text-white/20">Loading pitches...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-6 sm:mx-10 mt-2 rounded-xl p-3 text-sm flex-shrink-0"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
            {error}
            <button onClick={() => setError("")} className="ml-3 text-red-400/50 hover:text-red-300 text-lg leading-none">&times;</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && allSubmissions.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-3 opacity-25">🎤</div>
              <p className="text-white/20 text-sm">No pitches submitted yet. Be the first!</p>
            </div>
          </div>
        )}

        {!loading && !error && allSubmissions.length > 0 && filteredSubmissions.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-3 opacity-25">🔍</div>
              <p className="text-white/30 text-sm">No pitches match "{searchQuery}".</p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
             MAIN CONTENT — Top 3 + Grid
            ═══════════════════════════════════════ */}
        {!loading && !error && filteredSubmissions.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0 px-3 sm:px-8 lg:px-10 pt-4">

            {/* ── TOP 3 PODIUM ── */}
            {topPitches.length > 0 && (
              <div className="flex-shrink-0 mb-4">
                <div className="grid gap-2 sm:gap-3 items-end"
                  style={{ gridTemplateColumns: topPitches.length >= 3 ? "1fr 1.2fr 1fr" : `repeat(${topPitches.length}, 1fr)` }}>
                  {(topPitches.length >= 3 ? [topPitches[1], topPitches[0], topPitches[2]] : topPitches).map((pitch, displayIdx) => {
                    const actualRank = topPitches.length >= 3 ? [1, 0, 2][displayIdx] : displayIdx;
                    const badge = RANK_BADGES[actualRank];
                    const isFirst = actualRank === 0;
                    const isPulsing = pulsingVoteIds.includes(pitch.id);

                    return (
                      <button key={pitch.id}
                        onClick={() => setSelectedPitch(pitch)}
                        className={`relative group rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] ${isPulsing ? "ring-2 ring-[#F2B517]" : ""}`}
                        style={{
                          aspectRatio: isFirst ? "16/7.5" : "16/9",
                          boxShadow: `${badge.shadow}, 0 8px 32px rgba(0,0,0,0.4)`,
                          border: `1px solid ${badge.ring}`,
                          animation: "fadeInUp 0.5s ease-out both",
                          animationDelay: `${displayIdx * 0.12}s`,
                        }}>
                        <img src={getThumbnail(pitch)} alt={pitch.title}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />

                        {/* Always-visible gradient */}
                        <div className="absolute inset-0"
                          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.35) 45%, transparent 75%)" }} />

                        {/* Crown badge */}
                        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1"
                          style={{ background: badge.gradient, boxShadow: badge.shadow }}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <svg className="w-3.5 h-3.5" fill={badge.textColor} viewBox="0 0 24 24">
                              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                            </svg>
                          </div>
                          <span className="text-[11px] font-black tracking-wider" style={{ color: badge.textColor }}>{badge.short}</span>
                        </div>

                        {/* Vote — maize star, big */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5"
                          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", border: "1px solid rgba(242,181,23,0.2)" }}>
                          <svg className="w-5 h-5" fill="#F2B517" viewBox="0 0 24 24">
                            <path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5L12 16.8l-4.9 2.5.9-5.5-4-3.9 5.5-.8L12 4z" />
                          </svg>
                          <span className="text-base font-black" style={{ color: "#F2B517" }}>{pitch.vote_count || 0}</span>
                        </div>

                        {/* Info */}
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          <p className="text-white font-bold truncate leading-tight" style={{ fontSize: isFirst ? "16px" : "14px" }}>{pitch.title}</p>
                          <p className="text-white/40 text-xs truncate mt-0.5">{pitch.name}</p>
                        </div>

                        {/* Voted */}
                        {pitch.user_has_voted && (
                          <div className="absolute bottom-3 right-3 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#F2B517" }}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#0B1A3B" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="flex-shrink-0 mb-4">
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, submitter, description, or tag"
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-white/30 hover:text-white/60 text-lg leading-none px-1"
                    aria-label="Clear search"
                  >
                    &times;
                  </button>
                )}
              </div>
              <p className="text-[11px] text-white/25 mt-1.5">
                Showing {filteredSubmissions.length} of {allSubmissions.length} pitches
              </p>
            </div>

            {/* ── ALL PITCHES GRID ── */}
            <div>
              {/* Grid — responsive: 2 cols on phones, 3 on small tablets, 4 on tablets, 6 on desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-0.5 sm:gap-0 rounded-xl overflow-hidden">
                {paginatedGallery.map((pitch, i) => {
                  const isPulsing = pulsingVoteIds.includes(pitch.id);

                  return (
                    <button key={pitch.id}
                      onClick={() => setSelectedPitch(pitch)}
                      className={`relative block w-full overflow-hidden bg-[#0a0e18] group ${isPulsing ? "ring-2 ring-[#F2B517] ring-inset" : ""}`}
                      style={{
                        aspectRatio: "16/9",
                        animation: "fadeInUp 0.3s ease-out both",
                        animationDelay: `${i * 0.025}s`,
                      }}>
                      <img src={getThumbnail(pitch)} alt={pitch.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2.5">
                        <p className="text-white font-bold text-[11px] truncate leading-tight">{pitch.title}</p>
                        <p className="text-white/50 text-[10px] truncate">{pitch.name}</p>
                      </div>

                      {/* Vote — maize star */}
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full px-2 py-0.5"
                        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
                        <svg className="w-3.5 h-3.5" fill="#F2B517" viewBox="0 0 24 24">
                          <path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5L12 16.8l-4.9 2.5.9-5.5-4-3.9 5.5-.8L12 4z" />
                        </svg>
                        <span className="text-[11px] font-bold text-white">{pitch.vote_count || 0}</span>
                      </div>

                      {/* Voted */}
                      {pitch.user_has_voted && (
                        <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#F2B517" }}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="#0B1A3B" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Pagination — always visible under last row, disabled when only 1 page */}
              <div className="flex items-center justify-center py-5">
                <div className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition-opacity ${totalGalleryPages <= 1 ? "opacity-30 pointer-events-none" : ""}`}
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <button onClick={() => { setGalleryPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={galleryPage <= 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white/25 hover:text-white hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  {Array.from({ length: Math.max(Math.min(totalGalleryPages, 9), 1) }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => { setGalleryPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      disabled={totalGalleryPages <= 1}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all disabled:cursor-not-allowed"
                      style={{
                        background: p === galleryPage ? "#F2B517" : "transparent",
                        color: p === galleryPage ? "#0B1A3B" : "rgba(255,255,255,0.2)",
                      }}>
                      {p}
                    </button>
                  ))}
                  {totalGalleryPages > 9 && <span className="text-white/10 text-[10px] px-1">...</span>}
                  <button onClick={() => { setGalleryPage((p) => Math.min(totalGalleryPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={galleryPage >= totalGalleryPages}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white/25 hover:text-white hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PITCH DETAIL MODAL ═══ */}
        {selectedPitch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            style={{ background: "rgba(0,0,0,0.88)" }}
            onClick={() => setSelectedPitch(null)}>
            <div className="relative w-full max-w-6xl max-h-[92vh] sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              {/* Floating custom thumbnail — overlaps top-left corner (desktop only; hidden on mobile to avoid clipping) */}
              {(getPitchType(selectedPitch) === "text" || getPitchType(selectedPitch) === "audio") && selectedPitch.thumbnail_path && (
                <img src={selectedPitch.thumbnail_path} alt=""
                  className="hidden md:block absolute z-10 rounded-2xl pointer-events-none"
                  style={{
                    width: "350px",
                    height: "auto",
                    top: "-24px",
                    left: "-24px",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
                  }}
                />
              )}
              <div className="w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col md:flex-row rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #0B1A3B 0%, #0d1f45 100%)",
                boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
              }}>

              {/* Left: Media / Content */}
              <div className="flex-1 min-w-0 flex items-center justify-center" style={{ background: selectedPitch.mux_playback_id ? "#000" : (getPitchType(selectedPitch) === "text" || getPitchType(selectedPitch) === "audio") ? "#0a0f1e" : "#000" }}>
                <style>{`.text-pitch-scroll::-webkit-scrollbar { display: none; }`}</style>
                {selectedPitch.mux_playback_id ? (
                  <MuxPlayer playbackId={selectedPitch.mux_playback_id} accentColor="#F2B517"
                    style={{ width: "100%", aspectRatio: "16/9" }} />
                ) : getPitchType(selectedPitch) === "audio" ? (
                  <div className="w-full h-full flex flex-col max-h-[45vh] md:max-h-[80vh]">
                    {/* Audio player */}
                    <div className="w-full px-8 pt-8 pb-4 flex-shrink-0">
                      {selectedPitch.thumbnail_path && (
                        <div style={{ float: "left", width: "340px", height: "210px", marginRight: "20px", marginBottom: "4px", marginTop: "-32px", marginLeft: "-32px" }} />
                      )}
                      {selectedPitch.file_path && (
                        <audio controls className="w-full" style={{ filter: "invert(1) hue-rotate(180deg)", opacity: 0.7 }}>
                          <source src={`/api/gallery/stream-audio?path=${encodeURIComponent(selectedPitch.file_path)}`} />
                        </audio>
                      )}
                    </div>
                    {/* Description text below player */}
                    {(extractedText || selectedPitch.text_content || selectedPitch.description) && (
                      <div className="w-full flex-1 overflow-y-auto text-pitch-scroll px-8 pb-8" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                        <p className="text-sm text-white/70 leading-relaxed">{extractedText || selectedPitch.text_content || selectedPitch.description}</p>
                      </div>
                    )}
                  </div>
                ) : getPitchType(selectedPitch) === "text" ? (
                  <div className="w-full h-full flex flex-col max-h-[45vh] md:max-h-[80vh]">
                    {extractingText ? (
                      <div className="w-full flex-1 flex items-center justify-center">
                        <svg className="animate-spin h-6 w-6 text-white/30" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      </div>
                    ) : (extractedText || selectedPitch.text_content) ? (
                      <div className="w-full h-full overflow-y-auto text-pitch-scroll" style={{ maxHeight: "80vh", padding: "32px", scrollbarWidth: "none", msOverflowStyle: "none" }}>
                        {/* Invisible spacer for the overlapping thumbnail (only if custom thumbnail) */}
                        {selectedPitch.thumbnail_path && (
                          <div style={{ float: "left", width: "340px", height: "210px", marginRight: "20px", marginBottom: "4px", marginTop: "-32px", marginLeft: "-32px" }} />
                        )}
                        <p className="text-sm text-white/70 leading-relaxed">{extractedText || selectedPitch.text_content}</p>
                      </div>
                    ) : (
                      <div className="w-full flex items-center justify-center p-8">
                        <p className="text-white/25 text-sm italic">No text content available</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full" style={{ aspectRatio: "16/9" }}>
                    <img src={getThumbnail(selectedPitch)} alt={selectedPitch.title} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Right: Info */}
              <div className="w-full md:w-96 flex-shrink-0 flex flex-col p-5 sm:p-6 max-h-[45vh] md:max-h-none overflow-y-auto md:overflow-visible" style={{ borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
                <button onClick={() => setSelectedPitch(null)}
                  className="self-end p-1.5 rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-colors mb-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {/* Rank badge if top 3 */}
                {(() => {
                  const rank = topPitches.findIndex((p) => p.id === selectedPitch.id);
                  if (rank === -1) return null;
                  const badge = RANK_BADGES[rank];
                  return (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1" style={{ background: badge.gradient, boxShadow: badge.shadow }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.2)" }}>
                          <svg className="w-3 h-3" fill={badge.textColor} viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" /></svg>
                        </div>
                        <span className="text-[10px] font-black tracking-wider" style={{ color: badge.textColor }}>{badge.label}</span>
                      </div>
                    </div>
                  );
                })()}

                <h2 className="text-xl font-bold text-white leading-tight mb-1">{selectedPitch.title}</h2>
                <p className="text-xs text-white/35 mb-4">by {selectedPitch.name}</p>

                <div className="flex-1 min-h-0 overflow-y-auto mb-4">
                  <p className="text-sm text-white/45 leading-relaxed">{selectedPitch.description}</p>
                </div>

                {selectedPitch.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4 flex-shrink-0">
                    {selectedPitch.tags.map((tag) => (
                      <span key={tag.id} className="px-2.5 py-0.5 text-[10px] rounded-full font-medium"
                        style={{ background: "rgba(242,181,23,0.08)", color: "rgba(242,181,23,0.6)", border: "1px solid rgba(242,181,23,0.1)" }}>{tag.name}</span>
                    ))}
                  </div>
                )}

                {/* Vote area */}
                <div className="flex items-center justify-between flex-shrink-0 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex items-center gap-2">
                    <svg className="w-6 h-6" fill="#F2B517" viewBox="0 0 24 24">
                      <path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5L12 16.8l-4.9 2.5.9-5.5-4-3.9 5.5-.8L12 4z" />
                    </svg>
                    <span className="text-2xl font-black text-white tabular-nums">{selectedPitch.vote_count || 0}</span>
                  </div>
                  <button onClick={() => handleVote(selectedPitch.id)}
                    disabled={voteSubmitting[selectedPitch.id]}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    style={{
                      background: selectedPitch.user_has_voted ? "rgba(242,181,23,0.12)" : "#F2B517",
                      color: selectedPitch.user_has_voted ? "#F2B517" : "#0B1A3B",
                      border: selectedPitch.user_has_voted ? "1px solid rgba(242,181,23,0.25)" : "1px solid transparent",
                    }}>
                    {voteSubmitting[selectedPitch.id] ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : selectedPitch.user_has_voted ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Voted
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5L12 16.8l-4.9 2.5.9-5.5-4-3.9 5.5-.8L12 4z" /></svg>
                        Vote
                      </>
                    )}
                  </button>
                </div>

                {voterProfile.email && (
                  <p className="text-[10px] text-white/15 mt-2 text-center flex-shrink-0">
                    {voting.remainingVotes} of {voting.maxVotesPerUser} votes remaining
                  </p>
                )}
              </div>
            </div>
            </div>
          </div>
        )}

        {/* ═══ VOTER MODAL ═══ */}
        {showVoterModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={() => { setShowVoterModal(false); setPendingPitchId(null); }}>
            <div className="w-full max-w-md rounded-2xl p-6"
              style={{ background: "linear-gradient(135deg, rgba(11,26,59,0.97), rgba(13,21,48,0.97))", backdropFilter: "blur(24px)", border: "1px solid rgba(242,181,23,0.15)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-5 h-5" fill="#F2B517" viewBox="0 0 24 24"><path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5L12 16.8l-4.9 2.5.9-5.5-4-3.9 5.5-.8L12 4z" /></svg>
                <h3 className="text-lg font-bold text-white">Cast Your Vote</h3>
              </div>
              <p className="text-sm text-white/35 mb-5">Enter your name and email to start voting.</p>
              <form onSubmit={handleSaveVoterProfile} className="space-y-3">
                <input type="text" placeholder="Your name" value={voterForm.name}
                  onChange={(e) => setVoterForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-[#F2B517]/40"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  required />
                <input type="email" placeholder="you@umich.edu" value={voterForm.email}
                  onChange={(e) => setVoterForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-[#F2B517]/40"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  required />
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowVoterModal(false); setPendingPitchId(null); }}
                    className="px-4 py-2.5 text-sm font-medium text-white/35 hover:text-white/60 transition-colors">Cancel</button>
                  <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0B1A3B] transition-colors"
                    style={{ background: "#F2B517" }}>
                    Continue to Vote
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
