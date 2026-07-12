"use client";

import { useEffect, useMemo, useState } from "react";

function Card({ children, className = "" }) {
  return (
    <article
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
    </article>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xl font-bold text-white tracking-tight">{children}</h2>
  );
}

export default function FounderNewspaperPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [competitionDate, setCompetitionDate] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDigest() {
      try {
        setLoading(true);
        setError("");

        const [subRes, annRes, dateRes] = await Promise.all([
          fetch("/api/gallery/submissions?page=1&pageSize=24", { cache: "no-store" }),
          fetch("/api/announcements", { cache: "no-store" }),
          fetch("/api/admin/competition-date", { cache: "no-store" }),
        ]);

        const [subData, annData, dateData] = await Promise.all([
          subRes.json(),
          annRes.json(),
          dateRes.json(),
        ]);

        if (!subRes.ok) throw new Error(subData.error || "Failed to load pitches.");
        if (!annRes.ok) throw new Error(annData.error || "Failed to load updates.");
        if (!dateRes.ok) throw new Error(dateData.error || "Failed to load deadline.");

        if (cancelled) return;
        setSubmissions(subData.submissions || []);
        setAnnouncements(annData || []);
        setCompetitionDate(dateData.competition_date || null);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load weekly digest.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDigest();
    return () => {
      cancelled = true;
    };
  }, []);

  const weeklyStats = useMemo(() => {
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
  }, [submissions]);

  const topPitches = useMemo(() => {
    return [...submissions]
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
      .slice(0, 5);
  }, [submissions]);

  const communityHighlights = useMemo(() => {
    const tagCounts = {};
    const creatorCounts = {};

    submissions.forEach((pitch) => {
      (pitch.tags || []).forEach((tag) => {
        if (!tag?.name) return;
        tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
      });
      if (pitch.name) {
        creatorCounts[pitch.name] = (creatorCounts[pitch.name] || 0) + 1;
      }
    });

    const hottestTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
    const mostActive = Object.entries(creatorCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      hottestTag,
      mostActive,
      totalCreators: Object.keys(creatorCounts).length,
    };
  }, [submissions]);

  const deadlineInfo = useMemo(() => {
    if (!competitionDate) return { text: "No upcoming deadline posted yet.", daysLeft: null };
    const diff = new Date(competitionDate).getTime() - Date.now();
    const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));
    if (daysLeft < 0) {
      return { text: "The current competition deadline has passed.", daysLeft };
    }
    return {
      text: `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining until submission close.`,
      daysLeft,
    };
  }, [competitionDate]);

  return (
    <div
      className="relative min-h-[calc(100vh-4rem)] bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url('/admin_bg.png')" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, rgba(11,26,59,0.92) 0%, rgba(6,14,33,0.88) 50%, rgba(11,26,59,0.94) 100%)",
        }}
      />
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <header className="mb-6 border-b border-white/10 pb-5">
          
          <h1 className="text-4xl font-black text-white mt-1">10KP Weekly Digest</h1>
          
        </header>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <svg className="animate-spin h-7 w-7 text-maize" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : error ? (
          <div className="rounded-xl p-4 text-sm text-red-300 border border-red-500/25 bg-red-500/10">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <SectionTitle>10K Pitches Weekly</SectionTitle>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03]">
                  <p className="text-xs uppercase tracking-wider text-white/50">New This Week</p>
                  <p className="text-3xl font-black mt-1">{weeklyStats.count}</p>
                </div>
                <div className="rounded-xl bg-maize text-navy p-4">
                  <p className="text-xs uppercase tracking-wider text-navy/70">Weekly Votes</p>
                  <p className="text-3xl font-black mt-1 text-navy">{weeklyStats.votes}</p>
                </div>
                <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03]">
                  <p className="text-xs uppercase tracking-wider text-white/40">Top Weekly Pitch</p>
                  <p className="text-sm font-semibold text-white mt-2 line-clamp-2">
                    {weeklyStats.topTitle}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle>Upcoming Deadlines</SectionTitle>
              <p className="mt-3 text-sm text-white/70">{deadlineInfo.text}</p>
              {competitionDate && (
                <p className="mt-3 text-xs text-white/40">
                  Scheduled for{" "}
                  {new Date(competitionDate).toLocaleString(undefined, {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </Card>

            <Card className="lg:col-span-2">
              <SectionTitle>Platform Updates</SectionTitle>
              <div className="mt-4 space-y-3">
                {announcements.length === 0 ? (
                  <p className="text-sm text-white/40">No platform updates posted this week.</p>
                ) : (
                  announcements.slice(0, 4).map((a) => (
                    <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-white">{a.title}</h3>
                        <span className="text-[11px] text-white/35 whitespace-nowrap">
                          {new Date(a.updated_at || a.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-white/65 mt-1 whitespace-pre-wrap line-clamp-3">
                        {a.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <SectionTitle>Community Highlights</SectionTitle>
              <div className="mt-4 space-y-3 text-sm text-white/70">
                <div>
                  <p className="text-white/40">Hottest Tag</p>
                  <p className="font-semibold text-white">
                    {communityHighlights.hottestTag
                      ? `${communityHighlights.hottestTag[0]} (${communityHighlights.hottestTag[1]} pitches)`
                      : "No tags yet"}
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Most Active Founder</p>
                  <p className="font-semibold text-white">
                    {communityHighlights.mostActive
                      ? `${communityHighlights.mostActive[0]} (${communityHighlights.mostActive[1]} submissions)`
                      : "No submissions yet"}
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Contributing Founders</p>
                  <p className="font-semibold text-white">
                    {communityHighlights.totalCreators}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-3">
              <SectionTitle>Top Pitches</SectionTitle>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {topPitches.length === 0 ? (
                  <p className="text-sm text-white/40">No pitches available yet.</p>
                ) : (
                  topPitches.map((pitch, idx) => (
                    <div
                      key={pitch.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <p className="text-[11px] uppercase tracking-wider text-white/40">
                        Rank #{idx + 1}
                      </p>
                      <h3 className="text-sm font-semibold text-white mt-1 line-clamp-2">
                        {pitch.title}
                      </h3>
                      <p className="text-xs text-white/40 mt-1">By {pitch.name}</p>
                      <p className="text-xs text-white/60 mt-2 line-clamp-2">
                        {pitch.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-white/35">
                          {(pitch.tags || []).slice(0, 2).map((t) => t.name).join(", ") || "No tags"}
                        </span>
                        <span className="text-sm font-bold text-maize">
                          👍 {pitch.vote_count || 0}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
