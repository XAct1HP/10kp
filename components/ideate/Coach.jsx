"use client";

import { useState } from "react";
import { Icon } from "./art";
import { COACH_ROLES } from "./theme";
import { SUBTLE, accent } from "./ui";
import { COACH_PREREQS, DAILY_COACH_LIMIT } from "../../lib/ideate/curriculum";

export function coachLeft(usage) {
  if (!usage) return DAILY_COACH_LIMIT;
  return Math.max(0, usage.limit - usage.used);
}

export function CoachOrb({ size = 44, busy = false }) {
  return (
    <span className="ideate-orb flex-shrink-0 flex items-center justify-center" data-busy={busy ? "true" : "false"} style={{ width: size, height: size }}>
      <span className="relative z-10" style={{ color: "var(--accent)" }}>
        <Icon name="sparkles" className="w-[45%] h-[45%] mx-auto" strokeWidth={2.2} />
      </span>
    </span>
  );
}

function ReplyBody({ reply, compact = false }) {
  return (
    <div className="space-y-3">
      {reply.message && <p className={`${compact ? "text-[13px]" : "text-sm sm:text-[15px]"} text-white/90 leading-relaxed`}>{reply.message}</p>}
      {reply.bullets?.length > 0 && (
        <ul className="grid gap-2">
          {reply.bullets.map((b, i) => (
            <li
              key={i}
              className="ideate-rise rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
              style={{ ...SUBTLE, borderLeft: `3px solid var(--accent)`, animationDelay: `${120 + i * 90}ms` }}
            >
              {b.label && <span className="block text-[11px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "var(--accent)" }}>{b.label}</span>}
              <span className="text-white/80">{b.text}</span>
            </li>
          ))}
        </ul>
      )}
      {reply.question && (
        <div className="ideate-rise flex gap-3 rounded-xl p-3.5" style={{ background: accent(0.1), animationDelay: "300ms" }}>
          <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm" style={{ background: "var(--accent)", color: "#0B1A3B" }}>?</span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/45">Think about this</p>
            <p className="text-sm sm:text-[15px] text-white font-medium leading-relaxed mt-0.5">{reply.question}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// The coach: an orb with a role, one or two asks, and a speech-bubble reply.
export default function CoachPanel({ data, actions, replies = [], busyMode, error, usage, onAsk, className = "mt-8" }) {
  const [showOlder, setShowOlder] = useState(false);
  const left = coachLeft(usage);
  const latest = replies[replies.length - 1];
  const older = replies.slice(0, -1).reverse();
  const busyHere = Boolean(busyMode) && actions.some((a) => a.mode === busyMode);
  const role = COACH_ROLES[actions[0]?.mode] || "Coach";
  const firstBlocked = COACH_PREREQS[actions[0].mode](data);

  return (
    <section
      className={`relative rounded-2xl p-4 sm:p-5 overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${accent(0.1)}, rgba(255,255,255,0.02) 60%)`, border: `1px solid ${accent(0.25)}` }}
    >
      <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full" style={{ background: `radial-gradient(circle, ${accent(0.18)}, transparent 70%)` }} />

      <div className="relative flex items-center gap-3">
        <CoachOrb busy={busyHere} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-white leading-tight">{role}</p>
          <p className="text-[11px] text-white/45 mt-0.5">UMGPT coach<span className="hidden sm:inline"> · asks, never answers for you</span></p>
        </div>
        <span className="text-[11px] font-semibold tabular-nums px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: left === 0 ? "#FCA5A5" : "rgba(255,255,255,0.6)" }}>
          {left} left today
        </span>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 mt-4">
        {actions.map((a) => {
          const blocked = COACH_PREREQS[a.mode](data);
          return (
            <button
              key={a.mode}
              type="button"
              disabled={Boolean(blocked) || Boolean(busyMode) || left === 0}
              onClick={() => onAsk(a.mode)}
              title={blocked || undefined}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:-translate-y-0.5"
              style={{ background: "var(--accent)", color: "#0B1A3B", boxShadow: blocked ? "none" : `0 8px 24px ${accent(0.3)}` }}
            >
              <Icon name="sparkles" className="w-4 h-4" strokeWidth={2.2} />
              {busyMode === a.mode ? "Thinking…" : a.label}
            </button>
          );
        })}
        {firstBlocked && actions.length === 1 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40">
            <Icon name="lock" className="w-3.5 h-3.5" />
            {firstBlocked}
          </span>
        )}
      </div>

      {busyHere && (
        <div className="relative mt-4 inline-flex items-center gap-3 rounded-2xl rounded-tl-sm px-4 py-3 ideate-fade" style={SUBTLE}>
          <span className="ideate-typing flex gap-1"><span /><span /><span /></span>
          <span className="text-xs text-white/50">Reading what you wrote…</span>
        </div>
      )}
      {error && <p className="relative mt-3 text-xs text-red-300">{error}</p>}

      {latest && !busyHere && (
        <div key={latest.at} className="relative mt-4 rounded-2xl rounded-tl-sm p-4 ideate-rise" style={{ background: "rgba(11,26,59,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ReplyBody reply={latest} />
        </div>
      )}

      {older.length > 0 && (
        <div className="relative mt-3">
          <button type="button" onClick={() => setShowOlder((v) => !v)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/40 hover:text-white/70 transition-colors">
            <Icon name={showOlder ? "x" : "clock"} className="w-3.5 h-3.5" />
            {showOlder ? "Hide earlier notes" : `Earlier notes (${older.length})`}
          </button>
          {showOlder && (
            <div className="mt-3 space-y-3">
              {older.map((r, i) => (
                <div key={`${r.at}-${i}`} className="rounded-xl p-3.5 ideate-fade" style={SUBTLE}>
                  <ReplyBody reply={r} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
