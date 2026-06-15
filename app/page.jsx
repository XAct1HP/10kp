"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, past: true });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
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

export default function Home() {
  const [competitionDate, setCompetitionDate] = useState(null);
  const timeLeft = useCountdown(competitionDate);

  useEffect(() => {
    async function fetchDate() {
      try {
        const res = await fetch("/api/admin/competition-date");
        const data = await res.json();
        if (data.competition_date) setCompetitionDate(data.competition_date);
      } catch {
        // ignore
      }
    }
    fetchDate();
  }, []);

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div
      className="relative min-h-[calc(100vh-4rem)] flex flex-col bg-cover bg-center"
      style={{ backgroundImage: "url('/10kp_hero_image.png')" }}
    >
      {/* Dark gradient overlay — heavier at bottom for countdown readability */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.25) 40%, rgba(11,26,59,0.7) 100%)",
        }}
      />

      {/* ── Main content area ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-between px-6 sm:px-10 lg:px-16 py-12">
        {/* Top section — headline + CTA */}
        <div className="flex flex-col items-start justify-center flex-1 max-w-2xl">
          <div className="mb-6">
            <Image
              src="/10kp_tspnt.png"
              alt="10KP Logo"
              width={200}
              height={67}
              className="w-auto h-16 drop-shadow-xl mb-8"
              priority
            />
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.1] mb-4">
            Embracing
            <br />
            <span style={{ color: "#F2B517" }}>the Digital Pitch</span>
          </h1>

          <p className="text-white/60 text-lg sm:text-xl max-w-lg mb-10 leading-relaxed">
            Where bold ideas meet the stage. Submit your pitch, compete for $10K, and launch something real.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="/intake"
              className="relative inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group"
              style={{ background: "#F2B517" }}
            >
              <span className="relative z-10 flex items-center gap-2">
                Submit Your Pitch
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </Link>

            <Link
              href="/gallery"
              className="inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold rounded-xl transition-all duration-200 group"
              style={{
                border: "2px solid rgba(255,255,255,0.2)",
                color: "rgba(255,255,255,0.85)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#F2B517";
                e.currentTarget.style.color = "#F2B517";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                e.currentTarget.style.color = "rgba(255,255,255,0.85)";
              }}
            >
              View Gallery
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>

        {/* ── Bottom left — Countdown ── */}
        <div className="mt-12">
          {competitionDate && timeLeft && !timeLeft.past ? (
            <div>
              <p className="text-white/40 text-xs uppercase tracking-widest mb-4 font-semibold">
                Competition starts in
              </p>
              <div className="flex gap-3 sm:gap-4">
                {[
                  { label: "Days", value: timeLeft.days },
                  { label: "Hours", value: timeLeft.hours },
                  { label: "Min", value: timeLeft.minutes },
                  { label: "Sec", value: timeLeft.seconds },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="text-center"
                    style={{
                      background: "rgba(11, 26, 59, 0.6)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "1rem",
                      padding: "1rem 1.25rem",
                      minWidth: "80px",
                    }}
                  >
                    <div className="text-3xl sm:text-4xl font-bold font-mono text-white">
                      {pad(value)}
                    </div>
                    <div className="text-xs text-white/40 mt-1 uppercase tracking-wider">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : competitionDate && timeLeft?.past ? (
            <div
              className="inline-flex items-center gap-3 px-6 py-4 rounded-xl"
              style={{
                background: "rgba(242, 181, 23, 0.15)",
                border: "1px solid rgba(242, 181, 23, 0.3)",
              }}
            >
              <svg className="w-6 h-6" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-white font-semibold text-sm">Competition day is here!</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
