"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";

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

  const countdownUnits = timeLeft && !timeLeft.past
    ? [
        { label: "Days", value: timeLeft.days },
        { label: "Hours", value: timeLeft.hours },
        { label: "Min", value: timeLeft.minutes },
        { label: "Sec", value: timeLeft.seconds },
      ]
    : null;

  return (
    <div
      className="relative min-h-[calc(100vh-5rem)] flex flex-col bg-cover bg-center"
      style={{ backgroundImage: "url('/10kp_hero_image.png')" }}
    >
      {/* Gradient overlay - stronger on mobile for text readability */}
      <div
        className="absolute inset-0 lg:hidden"
        style={{
          background:
            "linear-gradient(to bottom, rgba(6,14,33,0.55) 0%, rgba(6,14,33,0.7) 45%, rgba(11,26,59,0.92) 85%, rgba(11,26,59,0.98) 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.15) 30%, rgba(11,26,59,0.75) 85%, rgba(11,26,59,0.92) 100%)",
        }}
      />

      {/* MOBILE LAYOUT (< lg) */}
      <div className="relative z-10 flex-1 flex flex-col lg:hidden px-6 sm:px-10 pt-6 pb-8">
        {/* TOP: transparent countdown with centered separators */}
        {countdownUnits && (
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.28em] font-semibold mb-4"
              style={{ color: "#F2B517" }}
            >
              Competition starts in
            </p>
            {/* 7-column grid: 4 numbers + 3 centered separators */}
            <div
              className="grid items-center"
              style={{ gridTemplateColumns: "1fr auto 1fr auto 1fr auto 1fr" }}
            >
              {countdownUnits.map(({ label, value }, i) => (
                <Fragment key={label}>
                  <div className="text-center">
                    <div
                      className="font-mono font-bold text-white leading-none tabular-nums"
                      style={{
                        fontSize: "clamp(1.75rem, 8vw, 2.75rem)",
                        textShadow: "0 0 30px rgba(242,181,23,0.2), 0 4px 16px rgba(0,0,0,0.5)",
                      }}
                    >
                      {pad(value)}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] mt-2 text-white/40">
                      {label}
                    </div>
                  </div>
                  {i < countdownUnits.length - 1 && (
                    <div className="flex flex-col items-center gap-1.5 mb-4">
                      <div className="rounded-full" style={{ width: "5px", height: "5px", background: "#F2B517", opacity: 0.7 }} />
                      <div className="rounded-full" style={{ width: "5px", height: "5px", background: "#F2B517", opacity: 0.7 }} />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        )}

        {timeLeft?.past && (
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 flex-shrink-0" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-white font-bold text-base">Competition day is here!</span>
          </div>
        )}

        {/* BOTTOM: headline + description + side-by-side buttons */}
        <div className="mt-auto pt-10">
          <h1
            className="font-bold text-white tracking-tight leading-[1.05] mb-4"
            style={{ fontSize: "clamp(2rem, 9vw, 3.25rem)" }}
          >
            Embracing{" "}
            <span style={{ color: "#F2B517" }}>the Digital Pitch</span>
          </h1>

          <p className="text-white/75 text-sm sm:text-base max-w-lg leading-relaxed mb-6">
            Where bold ideas meet the stage. Submit your pitch, compete for $10K, and launch something real.
          </p>

          {/* Side-by-side CTAs */}
          <div className="flex gap-2.5">
            <Link
              href="/intake"
              className="relative flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold rounded-lg transition-all duration-200 overflow-hidden text-black active:scale-[0.98] group"
              style={{ background: "#F2B517" }}
            >
              <span className="relative z-10 flex items-center gap-1.5">
                Submit Pitch
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            </Link>

            <Link
              href="/gallery"
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold rounded-lg transition-all duration-200 active:scale-[0.98]"
              style={{
                border: "1.5px solid rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.9)",
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(8px)",
              }}
            >
              View Gallery
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* DESKTOP LAYOUT (lg+) */}
      <div className="relative z-10 flex-1 hidden lg:flex items-end px-16 pb-14">
        <div className="max-w-2xl flex-shrink-0">
          <h1
            className="font-bold text-white tracking-tight leading-[1.05] mb-4"
            style={{ fontSize: "clamp(2.5rem, 5vw, 4.5rem)" }}
          >
            Embracing{" "}
            <span style={{ color: "#F2B517" }}>the Digital Pitch</span>
          </h1>

          <p className="text-white/50 text-lg max-w-lg mb-8 leading-relaxed">
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

        <div className="flex-1 flex justify-end items-end">
          {countdownUnits && (
            <div className="text-right">
              <p
                className="text-sm uppercase tracking-[0.25em] mb-5 font-semibold"
                style={{ color: "#F2B517" }}
              >
                Competition starts in
              </p>
              <div className="flex items-center justify-end gap-5">
                {countdownUnits.map(({ label, value }, i) => (
                  <div key={label} className="flex items-center gap-5">
                    <div className="text-center">
                      <div
                        className="font-mono font-bold leading-none"
                        style={{
                          fontSize: "clamp(3rem, 8vw, 6.5rem)",
                          color: "#FFFFFF",
                          textShadow: "0 0 40px rgba(242,181,23,0.15), 0 4px 20px rgba(0,0,0,0.4)",
                        }}
                      >
                        {pad(value)}
                      </div>
                      <div
                        className="text-xs uppercase tracking-[0.2em] mt-2"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        {label}
                      </div>
                    </div>
                    {i < 3 && (
                      <div className="flex flex-col items-center gap-3 mb-5">
                        <div className="rounded-full" style={{ width: "8px", height: "8px", background: "#F2B517", opacity: 0.7 }} />
                        <div className="rounded-full" style={{ width: "8px", height: "8px", background: "#F2B517", opacity: 0.7 }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-3 justify-end">
                <div style={{ width: "20px", height: "3px", background: "rgba(242,181,23,0.3)", borderRadius: "2px" }} />
                <div style={{ width: "60px", height: "3px", background: "#F2B517", borderRadius: "2px" }} />
              </div>
            </div>
          )}

          {competitionDate && timeLeft?.past && (
            <div
              className="inline-flex items-center gap-4 px-8 py-5 rounded-2xl"
              style={{
                background: "rgba(242, 181, 23, 0.12)",
                border: "1px solid rgba(242, 181, 23, 0.25)",
                backdropFilter: "blur(12px)",
              }}
            >
              <svg className="w-8 h-8" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-white font-bold text-lg tracking-wide">Competition day is here!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
