"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import MuxPlayer from "@mux/mux-player-react";

const GALLERY_PAGE_SIZE = 100; // fetch all, paginate client-side
const GRID_COLS = 4;
const ROWS_VISIBLE = 2; // 2 rows of gallery cards visible
const CARDS_PER_PAGE = GRID_COLS * ROWS_VISIBLE;
const TOP_COUNT = 4;

export default function GalleryPage() {
  const { user } = useAuth();

  const [allSubmissions, setAllSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [galleryPage, setGalleryPage] = useState(1);

  const [voting, setVoting] = useState({ maxVotesPerUser: 5, userVoteCount: 0, remainingVotes: 5 });
  const [voteSubmitting, setVoteSubmitting] = useState({});
  const [selectedPitch, setSelectedPitch] = useState(null);

  // Voter identity — auto-fill from auth if logged in
  const [voterProfile, setVoterProfile] = useState({ name: "", email: "" });
  const [showVoterModal, setShowVoterModal] = useState(false);
  const [pendingPitchId, setPendingPitchId] = useState(null);
  const [voterForm, setVoterForm] = useState({ name: "", email: "" });

  const [defaultThumbnails, setDefaultThumbnails] = useState({ audioThumbnail: null, textThumbnail: null });

  const [pulsingVoteIds, setPulsingVoteIds] = useState([]);
  const previousVotesRef = useRef({});

  // Randomization seed — stable per session
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

  // Live refresh
  useEffect(() => {
    if (loading) return;
    const id = setInterval(fetchSubmissions, 15000);
    return () => clearInterval(id);
  }, [loading, voterProfile.email]);

  // Detect vote changes for pulse animation
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

  // Keep selected pitch in sync
  useEffect(() => {
    if (!selectedPitch) return;
    const updated = allSubmissions.find((p) => p.id === selectedPitch.id);
    if (updated) setSelectedPitch(updated);
  }, [allSubmissions]);

  // ── Top performers (by votes, stable) ──
  const topPitches = useMemo(() =>
    [...allSubmissions].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)).slice(0, TOP_COUNT),
    [allSubmissions]
  );

  // ── Shuffled gallery (excluding top) ──
  const shuffledGallery = useMemo(() => {
    const topIds = new Set(topPitches.map((p) => p.id));
    const rest = allSubmissions.filter((p) => !topIds.has(p.id));
    // Seeded shuffle
    const arr = [...rest];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor((shuffleSeed * (i + 1) * 9301 + 49297) % arr.length);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [allSubmissions, topPitches, shuffleSeed]);

  const totalGalleryPages = Math.max(1, Math.ceil(shuffledGallery.length / CARDS_PER_PAGE));
  const paginatedGallery = shuffledGallery.slice((galleryPage - 1) * CARDS_PER_PAGE, galleryPage * CARDS_PER_PAGE);

  // ── Thumbnail helper ──
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

  // ── Card component ──
  const PitchCard = ({ pitch, rank, size = "normal" }) => {
    const isPulsing = pulsingVoteIds.includes(pitch.id);
    const type = getPitchType(pitch);
    const typeIcon = type === "video" ? "🎬" : type === "audio" ? "🎧" : "📝";

    return (
      <button
        onClick={() => setSelectedPitch(pitch)}
        className={`relative block w-full overflow-hidden bg-black group ${isPulsing ? "ring-2 ring-[#F2B517] ring-inset" : ""}`}
        style={{ aspectRatio: "16/9" }}
      >
        <img src={getThumbnail(pitch)} alt={pitch.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          <p className="text-white font-bold text-sm truncate leading-tight">{pitch.title}</p>
          <p className="text-white/60 text-xs truncate">{pitch.name}</p>
        </div>
        {/* Vote badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-lg"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", color: "#fff" }}>
          <span style={{ fontSize: "10px" }}>▲</span> {pitch.vote_count || 0}
        </div>
        {/* Type badge */}
        <div className="absolute top-2 left-2 text-xs" title={type}>{typeIcon}</div>
        {/* Rank badge for top */}
        {rank != null && (
          <div className="absolute bottom-2 left-2 rounded-full px-2.5 py-0.5 text-[11px] font-black shadow-lg"
            style={{ background: "#F2B517", color: "#0B1A3B" }}>#{rank + 1}</div>
        )}
        {/* Voted indicator */}
        {pitch.user_has_voted && (
          <div className="absolute bottom-2 right-2 rounded-full w-5 h-5 flex items-center justify-center"
            style={{ background: "#F2B517" }}>
            <svg className="w-3 h-3 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
        )}
      </button>
    );
  };

  // ── Main render ──
  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden flex flex-col" style={{ background: "#0a0f1a" }}>
      {/* Navbar separator — solid dark bar so it doesn't blend */}
      <div className="h-px w-full flex-shrink-0" style={{ background: "rgba(242,181,23,0.15)" }} />

      {/* Top bar: title + voting info */}
      <div className="flex items-center justify-between px-5 sm:px-8 py-3 flex-shrink-0" style={{ background: "rgba(11,26,59,0.6)" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white tracking-tight">Gallery</h1>
          <span className="hidden sm:inline text-xs text-white/30">{allSubmissions.length} pitches</span>
        </div>
        <div className="flex items-center gap-3">
          {voterProfile.email ? (
            <>
              <span className="text-xs text-white/40 hidden sm:inline">{voterProfile.email}</span>
              <span className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: "rgba(242,181,23,0.15)", color: "#F2B517" }}>
                {voting.remainingVotes} votes left
              </span>
            </>
          ) : (
            <span className="text-xs text-white/30">Click a pitch to vote</span>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <svg className="animate-spin h-6 w-6 text-[#F2B517]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        </div>
      )}

      {error && (
        <div className="mx-5 mt-3 rounded-xl p-3 text-sm flex-shrink-0" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          {error}
          <button onClick={() => setError("")} className="ml-3 text-red-400/60 hover:text-red-300">&times;</button>
        </div>
      )}

      {!loading && !error && allSubmissions.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/30 text-sm">No submissions yet.</p>
        </div>
      )}

      {/* Main content */}
      {!loading && !error && allSubmissions.length > 0 && (
        <div className="flex-1 flex flex-col min-h-0 px-3 sm:px-5 py-3">
          {/* Top Performers */}
          {topPitches.length > 0 && (
            <div className="flex-shrink-0 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#F2B517]">Top Performers</span>
                <div className="flex-1 h-px" style={{ background: "rgba(242,181,23,0.1)" }} />
              </div>
              <div className="grid grid-cols-4 gap-0 rounded-xl overflow-hidden">
                {topPitches.map((pitch, i) => (
                  <PitchCard key={pitch.id} pitch={pitch} rank={i} />
                ))}
              </div>
            </div>
          )}

          {/* Gallery grid */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30">All Pitches</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
              {totalGalleryPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setGalleryPage((p) => Math.max(1, p - 1))} disabled={galleryPage <= 1}
                    className="text-[10px] text-white/25 hover:text-white/50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">← Prev</button>
                  <span className="text-[10px] text-white/15 tabular-nums">{galleryPage}/{totalGalleryPages}</span>
                  <button onClick={() => setGalleryPage((p) => Math.min(totalGalleryPages, p + 1))} disabled={galleryPage >= totalGalleryPages}
                    className="text-[10px] text-white/25 hover:text-white/50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">Next →</button>
                </div>
              )}
            </div>
            <div className="flex-1 grid grid-cols-4 gap-0 rounded-xl overflow-hidden content-start" style={{ minHeight: 0 }}>
              {paginatedGallery.map((pitch) => (
                <PitchCard key={pitch.id} pitch={pitch} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PITCH DETAIL MODAL (no scroll) ═══ */}
      {selectedPitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setSelectedPitch(null)}>
          <div className="w-full max-w-5xl max-h-full flex rounded-2xl overflow-hidden"
            style={{ background: "#0B1A3B", boxShadow: "0 32px 80px rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Left: Media */}
            <div className="flex-1 bg-black flex items-center justify-center min-w-0">
              {selectedPitch.mux_playback_id ? (
                <MuxPlayer
                  playbackId={selectedPitch.mux_playback_id}
                  accentColor="#F2B517"
                  style={{ width: "100%", aspectRatio: "16/9" }}
                />
              ) : (
                <div className="w-full" style={{ aspectRatio: "16/9" }}>
                  <img src={getThumbnail(selectedPitch)} alt={selectedPitch.title} className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* Right: Info */}
            <div className="w-80 flex-shrink-0 flex flex-col p-6" style={{ background: "rgba(11,26,59,0.95)" }}>
              {/* Close */}
              <button onClick={() => setSelectedPitch(null)}
                className="self-end p-1.5 rounded-lg text-white/25 hover:text-white hover:bg-white/5 transition-colors mb-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              {/* Title & meta */}
              <h2 className="text-xl font-bold text-white leading-tight mb-1">{selectedPitch.title}</h2>
              <p className="text-xs text-white/40 mb-4">by {selectedPitch.name}</p>

              {/* Description */}
              <div className="flex-1 min-h-0 overflow-hidden mb-4">
                <p className="text-sm text-white/50 leading-relaxed line-clamp-6">{selectedPitch.description}</p>
                {selectedPitch.text_content && (
                  <div className="mt-3 rounded-xl p-3 text-xs text-white/40 leading-relaxed line-clamp-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    {selectedPitch.text_content}
                  </div>
                )}
              </div>

              {/* Tags */}
              {selectedPitch.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4 flex-shrink-0">
                  {selectedPitch.tags.map((tag) => (
                    <span key={tag.id} className="px-2 py-0.5 text-[10px] rounded-md font-medium"
                      style={{ background: "rgba(242,181,23,0.1)", color: "rgba(242,181,23,0.7)" }}>{tag.name}</span>
                  ))}
                </div>
              )}

              {/* Vote section */}
              <div className="flex items-center justify-between flex-shrink-0 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-white tabular-nums">{selectedPitch.vote_count || 0}</span>
                  <span className="text-xs text-white/25">votes</span>
                </div>
                <button
                  onClick={() => handleVote(selectedPitch.id)}
                  disabled={voteSubmitting[selectedPitch.id]}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{
                    background: selectedPitch.user_has_voted ? "rgba(242,181,23,0.15)" : "#F2B517",
                    color: selectedPitch.user_has_voted ? "#F2B517" : "#0B1A3B",
                    border: selectedPitch.user_has_voted ? "1px solid rgba(242,181,23,0.3)" : "1px solid transparent",
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
                      <span>▲</span>
                      Vote
                    </>
                  )}
                </button>
              </div>

              {/* Remaining votes */}
              {voterProfile.email && (
                <p className="text-[10px] text-white/20 mt-2 text-center flex-shrink-0">
                  {voting.remainingVotes} of {voting.maxVotesPerUser} votes remaining
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ VOTER MODAL (only for non-logged-in users) ═══ */}
      {showVoterModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => { setShowVoterModal(false); setPendingPitchId(null); }}>
          <div className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "rgba(11,26,59,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">Before you vote</h3>
            <p className="text-sm text-white/40 mb-5">Enter your name and email to start voting.</p>
            <form onSubmit={handleSaveVoterProfile} className="space-y-3">
              <input type="text" placeholder="Your name" value={voterForm.name}
                onChange={(e) => setVoterForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-[#F2B517]/40"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                required />
              <input type="email" placeholder="you@umich.edu" value={voterForm.email}
                onChange={(e) => setVoterForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-[#F2B517]/40"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                required />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowVoterModal(false); setPendingPitchId(null); }}
                  className="px-4 py-2.5 text-sm font-medium text-white/40 hover:text-white/70 transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0B1A3B] bg-[#F2B517] hover:bg-yellow-400 transition-colors">
                  Continue to Vote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
