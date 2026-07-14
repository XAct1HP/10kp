"use client";

import { useState, useEffect } from "react";
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
        {/* TOP: eyebrow + countdown */}
        <p
          className="text-[10px] uppercase tracking-[0.3em] font-semibold mb-3"
          style={{ color: "#F2B517" }}
        >
          10KP Competition
        </p>

        {/* Compact countdown card */}
        {countdownUnits && (
          <div
            className="rounded-2xl px-4 py-3.5"
            style={{
              background: "rgba(6,14,33,0.55)",
              border: "1px solid rgba(242,181,23,0.25)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            <p
              className="text-[9px] uppercase tracking-[0.28em] font-semibold mb-2.5"
              style={{ color: "#F2B517" }}
            >
              Competition starts in
            </p>
            <div className="flex items-center justify-between">
              {countdownUnits.map(({ label, value }, i) => (
                <div key={label} className="flex items-center">
                  <div className="text-center px-1">
                    <div
                      className="font-mono font-bold text-white leading-none tabular-nums"
                      style={{ fontSize: "clamp(1.5rem, 7vw, 2.25rem)" }}
                    >
                      {pad(value)}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.15em] mt-1.5 text-white/40">
                      {label}
                    </div>
                  </div>
                  {i < countdownUnits.length - 1 && (
                    <div className="mx-1 sm:mx-2 flex flex-col gap-1 mb-3">
                      <div className="w-1 h-1 rounded-full" style={{ background: "#F2B517", opacity: 0.6 }} />
                      <div className="w-1 h-1 rounded-full" style={{ background: "#F2B517", opacity: 0.6 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {timeLeft?.past && (
          <div
            className="inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl"
            style={{
              background: "rgba(242,181,23,0.14)",
              border: "1px solid rgba(242,181,23,0.3)",
              backdropFilter: "blur(12px)",
            }}
          >
            <svg className="w-6 h-6 flex-shrink-0" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-white font-bold text-base">Competition day is here!</span>
          </div>
        )}

        {/* MIDDLE: buttons — smaller, sit above the headline */}
        <div className="flex flex-col gap-2.5 mt-6">
          <Link
            href="/intake"
            className="relative flex items-center justify-center gap-2 w-full py-3 text-[13px] font-semibold rounded-lg transition-all duration-200 overflow-hidden text-black active:scale-[0.98] group"
            style={{ background: "#F2B517" }}
          >
            <span className="relative z-10 flex items-center gap-2">
              Submit Your Pitch
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
          </Link>

          <Link
            href="/gallery"
            className="flex items-center justify-center gap-2 w-full py-3 text-[13px] font-semibold rounded-lg transition-all duration-200 active:scale-[0.98]"
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

        {/* BOTTOM: headline + description — pushed to the bottom via mt-auto */}
        <div className="mt-auto pt-10">
          <h1
            className="font-bold text-white tracking-tight leading-[1.05] mb-4"
            style={{ fontSize: "clamp(2rem, 9vw, 3.25rem)" }}
          >
            Embracing{" "}
            <span style={{ color: "#F2B517" }}>the Digital Pitch</span>
          </h1>

          <p className="text-white/75 text-sm sm:text-base max-w-lg leading-relaxed">
            Where bold ideas meet the stage. Submit your pitch, compete for $10K, and launch something real.
          </p>
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
