"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";

const PAGE_SIZE = 20;
const VOTER_PROFILE_KEY = "gallery_voter_profile";

const BRAND_MAIZE = "#f5bd24";

export default function GalleryPage() {
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: false,
  });

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [voting, setVoting] = useState({
    maxVotesPerUser: 5,
    userVoteCount: 0,
    remainingVotes: 5,
  });

  const [voteSubmitting, setVoteSubmitting] = useState({});
  const [voterProfile, setVoterProfile] = useState({ name: "", email: "" });
  const [showVoterModal, setShowVoterModal] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState(null);
  const [pendingPitchId, setPendingPitchId] = useState(null);
  const [voterForm, setVoterForm] = useState({ name: "", email: "" });
  const [recentlyVotedIds, setRecentlyVotedIds] = useState([]);
  const [pulsingVoteIds, setPulsingVoteIds] = useState([]);
  const previousVotesRef = useRef({});

  const [defaultThumbnails, setDefaultThumbnails] = useState({
    audioThumbnail: null,
    textThumbnail: null,
  });

  const risingPitches = useMemo(
    () =>
      [...submissions]
        .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
        .slice(0, 4),
    [submissions]
  );

  const getThumbnail = (pitch) => {
    // 1. User-uploaded custom thumbnail always wins
    if (pitch.thumbnail_path) return pitch.thumbnail_path;
    // 2. For video pitches, use Mux thumbnail
    if (pitch.mux_playback_id) {
      return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1`;
    }
    // 3. For audio pitches, use admin-set default
    if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(pitch.file_name || "")) {
      return defaultThumbnails.audioThumbnail || "/placeholder.png";
    }
    // 4. For text/document pitches, use admin-set default
    if (pitch.text_content || /\.(txt|pdf|doc|docx|ppt|pptx)$/i.test(pitch.file_name || "")) {
      return defaultThumbnails.textThumbnail || "/placeholder.png";
    }
    // 5. Fallback
    return "/placeholder.png";
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawProfile = localStorage.getItem(VOTER_PROFILE_KEY);
    if (!rawProfile) return;

    try {
      const parsed = JSON.parse(rawProfile);
      if (parsed?.name && parsed?.email) {
        setVoterProfile({
          name: String(parsed.name).trim(),
          email: String(parsed.email).trim().toLowerCase(),
        });
      }
    } catch {
      // ignore malformed localStorage values
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSubmissions() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (voterProfile.email) {
          params.set("voterEmail", voterProfile.email);
        }

        const res = await fetch(`/api/gallery/submissions?${params.toString()}`, {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load submissions.");
        }

        if (cancelled) return;

        setSubmissions(data.submissions || []);

        setVoting(
          data.voting || {
            maxVotesPerUser: 5,
            userVoteCount: 0,
            remainingVotes: 5,
          }
        );

        if (data.defaults) {
          setDefaultThumbnails(data.defaults);
        }

        setPagination(
          data.pagination || {
            page,
            pageSize: PAGE_SIZE,
            total: 0,
            hasMore: false,
          }
        );
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load submissions.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSubmissions();

    return () => {
      cancelled = true;
    };
  }, [page, voterProfile.email]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;

    let cancelled = false;

    async function refreshLiveVotes() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (voterProfile.email) {
          params.set("voterEmail", voterProfile.email);
        }

        const res = await fetch(`/api/gallery/submissions?${params.toString()}`, {
          cache: "no-store",
        });

        const data = await res.json();
        if (!res.ok || cancelled) return;

        setSubmissions(data.submissions || []);
        setVoting(
          data.voting || {
            maxVotesPerUser: 5,
            userVoteCount: 0,
            remainingVotes: 5,
          }
        );
        if (data.defaults) {
          setDefaultThumbnails(data.defaults);
        }
        setPagination(
          data.pagination || {
            page,
            pageSize: PAGE_SIZE,
            total: 0,
            hasMore: false,
          }
        );
      } catch {
        // Keep the live board quiet if a background refresh fails.
      }
    }

    const liveVoteTimer = window.setInterval(refreshLiveVotes, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(liveVoteTimer);
    };
  }, [loading, page, voterProfile.email]);

  useEffect(() => {
    if (!submissions.length) return;

    const changedPitchIds = submissions
      .filter((pitch) => {
        const previousVoteCount = previousVotesRef.current[pitch.id];
        return (
          previousVoteCount !== undefined &&
          previousVoteCount !== (pitch.vote_count || 0)
        );
      })
      .map((pitch) => pitch.id);

    previousVotesRef.current = submissions.reduce((votesByPitch, pitch) => {
      votesByPitch[pitch.id] = pitch.vote_count || 0;
      return votesByPitch;
    }, {});

    if (!changedPitchIds.length) return;

    setPulsingVoteIds(changedPitchIds);
    setRecentlyVotedIds((currentIds) => [
      ...changedPitchIds,
      ...currentIds.filter((id) => !changedPitchIds.includes(id)),
    ].slice(0, 6));

    const pulseTimer = window.setTimeout(() => {
      setPulsingVoteIds([]);
    }, 1600);

    const recentTimer = window.setTimeout(() => {
      setRecentlyVotedIds((currentIds) =>
        currentIds.filter((id) => !changedPitchIds.includes(id))
      );
    }, 9000);

    return () => {
      window.clearTimeout(pulseTimer);
      window.clearTimeout(recentTimer);
    };
  }, [submissions]);

  useEffect(() => {
    if (!selectedPitch) return;

    const updatedPitch = submissions.find((pitch) => pitch.id === selectedPitch.id);
    if (updatedPitch) {
      setSelectedPitch(updatedPitch);
    }
  }, [submissions, selectedPitch]);

  const submitVoteRequest = async (pitchId, profile) => {
    const targetPitch = submissions.find((pitch) => pitch.id === pitchId);
    const isUnvote = Boolean(targetPitch?.user_has_voted);

    setVoteSubmitting((prev) => ({
      ...prev,
      [pitchId]: true,
    }));

    setError("");

    try {
      const res = await fetch("/api/gallery/votes", {
        method: isUnvote ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pitchId,
          voterName: profile.name,
          voterEmail: profile.email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to cast vote.");
      }

      setSubmissions((prev) =>
        prev.map((pitch) =>
          pitch.id === pitchId
            ? {
                ...pitch,
                vote_count: data.pitchVoteCount,
                user_has_voted: data.action === "voted",
              }
            : pitch
        )
      );

      setVoting({
        maxVotesPerUser: data.maxVotesPerUser,
        userVoteCount: data.userVoteCount,
        remainingVotes: data.remainingVotes,
      });
    } catch (err) {
      setError(err.message || "Failed to cast vote.");
    } finally {
      setVoteSubmitting((prev) => ({
        ...prev,
        [pitchId]: false,
      }));
    }
  };

  const handleVote = async (pitchId) => {
    if (!voterProfile.email || !voterProfile.name) {
      setPendingPitchId(pitchId);
      setVoterForm((prev) => ({
        name: prev.name || "",
        email: prev.email || "",
      }));
      setShowVoterModal(true);
      return;
    }

    await submitVoteRequest(pitchId, voterProfile);
  };

  const handleSaveVoterProfile = async (e) => {
    e.preventDefault();
    const name = voterForm.name.trim();
    const email = voterForm.email.trim().toLowerCase();

    if (!name) {
      setError("Please enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    const profile = { name, email };
    setVoterProfile(profile);
    if (typeof window !== "undefined") {
      localStorage.setItem(VOTER_PROFILE_KEY, JSON.stringify(profile));
    }
    setShowVoterModal(false);

    if (pendingPitchId) {
      const pitchIdToVote = pendingPitchId;
      setPendingPitchId(null);
      await submitVoteRequest(pitchIdToVote, profile);
    }
  };

  const totalPages = Math.max(
    1,
    Math.ceil(
      (pagination.total || 0) /
        (pagination.pageSize || PAGE_SIZE)
    )
  );

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#111827]">
      <div className="w-full min-h-screen">
        {/* Hero Banner */}
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-12 md:px-10">
          <h1 className="mb-3 text-4xl font-black tracking-tight text-[#0b1736] md:text-5xl">
            Submission <span className="text-[#f5bd24]">Gallery</span>
          </h1>
          <p className="max-w-2xl text-base font-medium leading-7 text-slate-600 md:text-lg">
            Browse, preview, and vote on the best competition submissions.
          </p>
        </div>

        {/* Voting Summary */}
        <div className="mx-5 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:mx-10">
          <p className="text-sm font-medium text-slate-600">
            {voterProfile.email
              ? `Votes used: ${voting.userVoteCount}/${voting.maxVotesPerUser} (${voterProfile.email})`
              : "Click Vote to enter your name and email."}
          </p>

          {voterProfile.email && (
            <span className="rounded-full bg-[#f5bd24] px-3 py-1 text-sm font-black text-[#0b1736]">
              Remaining votes: {voting.remainingVotes}
            </span>
          )}
        </div>

        {!loading && !error && pagination.total > 0 && (
          <p className="mx-5 mb-8 text-sm font-medium text-slate-500 md:mx-10">
            Showing page {pagination.page} of {totalPages} (
            {pagination.total} total submissions)
          </p>
        )}

        {loading && (
          <div className="py-16 text-center">
            <p className="font-medium text-slate-500">
              Loading submissions...
            </p>
          </div>
        )}

        {error && (
          <div className="mx-5 mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 md:mx-10">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          submissions.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-medium text-slate-500">
                No submissions available yet.
              </p>
            </div>
          )}

        
        {!loading &&
          !error &&
          submissions.length > 0 && (
            <>
              <div className="mx-4 mb-8 rounded-2xl bg-[#081936] p-4 shadow-2xl md:mx-8 md:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white">
                    Rising Pitches
                  </h2>
                  <span className="rounded-full bg-[#f5bd24] px-3 py-1 text-xs font-black text-[#0b1736] shadow-sm">
                    Live vote board
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {risingPitches.map((pitch, index) => {
                    const isRecentlyVoted = recentlyVotedIds.includes(pitch.id);
                    const isPulsing = pulsingVoteIds.includes(pitch.id);

                    return (
                      <button
                        key={pitch.id}
                        onClick={() => setSelectedPitch(pitch)}
                        className={`relative aspect-[16/10] overflow-hidden rounded-xl bg-black text-left shadow-sm transition-transform hover:scale-[1.02] ${
                          isPulsing ? "animate-pulse ring-4 ring-[#f5bd24]" : ""
                        }`}
                      >
                        <img
                          src={getThumbnail(pitch)}
                          alt={pitch.title}
                          className="h-full w-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute left-3 top-3 rounded-full bg-[#f5bd24] px-2 py-1 text-xs font-black text-[#0b1736]">
                          #{index + 1}
                        </div>
                        <div className="absolute right-3 top-3 rounded-full bg-white/95 px-2 py-1 text-xs font-black text-[#0b1736] shadow">
                          👍 {pitch.vote_count || 0}
                        </div>
                        {isRecentlyVoted && (
                          <div className="absolute bottom-12 left-3 rounded-full bg-emerald-400 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-950">
                            Recently voted
                          </div>
                        )}
                        <div className="absolute bottom-3 left-3 right-3">
                          <p className="truncate text-sm font-black text-white">
                            {pitch.title}
                          </p>
                          <p className="truncate text-xs text-white/80">
                            By {pitch.name}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mx-4 grid grid-cols-4 gap-0 overflow-hidden rounded-2xl bg-[#081936] shadow-xl md:mx-8">
                {submissions.map((pitch) => {
                  const thumbnail = getThumbnail(pitch);
                  const isRecentlyVoted = recentlyVotedIds.includes(pitch.id);
                  const isPulsing = pulsingVoteIds.includes(pitch.id);

                  return (
                    <button
                      key={pitch.id}
                      onClick={() => setSelectedPitch(pitch)}
                      className={`relative m-0 block aspect-square w-full overflow-hidden border-0 p-0 group bg-black transition-shadow ${
                        isPulsing ? "animate-pulse ring-4 ring-[#f5bd24] ring-inset" : ""
                      }`}
                    >
                      <img
                        src={thumbnail}
                        alt={pitch.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />

                      <div className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-black text-[#0b1736] shadow">
                        👍 {pitch.vote_count || 0}
                      </div>

                      {isRecentlyVoted && (
                        <div className="absolute left-2 top-2 rounded-full bg-emerald-400 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-950 shadow">
                          Recent
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="text-white font-bold text-lg">
                        👍 {pitch.vote_count || 0}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mx-4 mt-8 flex items-center justify-between gap-4 pb-12 md:mx-8">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-[#0b1736] shadow-sm transition hover:border-[#f5bd24] hover:bg-[#f5bd24]"
                >
                  Previous
                </button>

                <p className="text-sm font-black text-slate-600">Page {pagination.page} of {totalPages}</p>

                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!pagination.hasMore || loading}
                  className="rounded-xl bg-[#f5bd24] px-5 py-3 text-sm font-black text-[#0b1736] shadow-sm transition hover:bg-[#e0aa17] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Next
                </button>
              </div>
            </>
          )}

        {selectedPitch && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setSelectedPitch(null)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-auto rounded-2xl bg-white shadow-2xl lg:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="lg:w-2/3 bg-black">
                {selectedPitch.mux_playback_id ? (
                  <MuxPlayer
                    playbackId={selectedPitch.mux_playback_id}
                    accentColor={BRAND_MAIZE}
                    style={{ width: "100%", minHeight: "500px" }}
                  />
                ) : null}
              </div>

              <div className="lg:w-1/3 p-6">
                <h2 className="text-2xl font-black tracking-tight text-[#0b1736]">{selectedPitch.title}</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">By {selectedPitch.name}</p>

                <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {selectedPitch.description}
                </p>

                <div className="mt-6 flex items-center justify-between">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-[#0b1736]">
                  👍 {selectedPitch.vote_count || 0}
                  </span>

                  <button
                    onClick={() => handleVote(selectedPitch.id)}
                    className="rounded-xl bg-[#f5bd24] px-5 py-3 text-sm font-black text-[#0b1736] shadow-sm transition hover:bg-[#e0aa17]"
                  >
                    {selectedPitch.user_has_voted ? "Unvote" : "Vote"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

{showVoterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <h2 className="mb-2 text-xl font-black tracking-tight text-[#0b1736]">Before you vote</h2>
              <p className="mb-5 text-sm font-medium leading-6 text-slate-600">
                Enter your name and email once to continue voting.
              </p>

              <form onSubmit={handleSaveVoterProfile} className="space-y-3">
                <input
                  type="text"
                  placeholder="Your name"
                  value={voterForm.name}
                  onChange={(e) =>
                    setVoterForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium outline-none transition focus:border-[#f5bd24] focus:ring-4 focus:ring-[#f5bd24]/20"
                  required
                />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={voterForm.email}
                  onChange={(e) =>
                    setVoterForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium outline-none transition focus:border-[#f5bd24] focus:ring-4 focus:ring-[#f5bd24]/20"
                  required
                />

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowVoterModal(false);
                      setPendingPitchId(null);
                    }}
                    className="px-4 py-2 text-sm font-black text-slate-500 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#f5bd24] px-5 py-3 text-sm font-black text-[#0b1736] shadow-sm transition hover:bg-[#e0aa17]"
                  >
                    Continue to Vote
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
