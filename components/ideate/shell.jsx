"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, StageArt } from "./art";
import { CoachOrb } from "./Coach";
import { PitchTimeline, formatClock, pitchStatus } from "./stages";
import { MAIZE, NAVY, STAGE_THEME, RATING_COLORS, BEAT_COLORS } from "./theme";
import { GLASS, SUBTLE, PrimaryButton, GhostButton, ProgressRing, Avatar, AutoTextarea, personaName, accent, tint } from "./ui";
import {
  STEPS,
  CHECK_RATINGS,
  PITCH_BEATS,
  DAILY_COACH_LIMIT,
  SHORT_TEXT,
  LONG_TEXT,
  OBJECTION_COUNT,
  stepReady,
  answeredRungs,
  namedIdeas,
  pitchSeconds,
  problemSentence,
} from "../../lib/ideate/curriculum";

const filled = (s) => typeof s === "string" && s.trim().length > 0;

// ─── Backdrop ──────────────────────────────────────────────────────────
// One pre-rendered glow layer per stage; switching stages cross-fades them.

export function Backdrop({ stageId }) {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, background: NAVY }} aria-hidden="true">
      {STEPS.map((s) => {
        const t = STAGE_THEME[s.id];
        return (
          <div
            key={s.id}
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              opacity: s.id === stageId ? 1 : 0,
              background: `radial-gradient(55% 45% at 88% 8%, rgba(${t.rgb}, 0.2), transparent 70%), radial-gradient(45% 45% at 4% 96%, rgba(${t.second}, 0.14), transparent 70%)`,
            }}
          />
        );
      })}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 80%)",
        }}
      />
    </div>
  );
}

// ─── Stage header ──────────────────────────────────────────────────────

export function StageHero({ step, saveSlot }) {
  const s = STEPS[step];
  const t = STAGE_THEME[s.id];
  return (
    <div key={s.id} className="ideate-rise relative flex items-center gap-4 sm:gap-8 mb-6 sm:mb-8">
      <span
        className="hidden sm:block pointer-events-none select-none absolute -left-2 -top-10 font-black leading-none"
        style={{ fontSize: 160, color: "transparent", WebkitTextStroke: `1.5px ${accent(0.12)}` }}
        aria-hidden="true"
      >
        {String(step + 1).padStart(2, "0")}
      </span>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="inline-flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ background: accent(0.14), color: "var(--accent)", border: `1px solid ${accent(0.3)}` }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--accent)", color: NAVY }}>
              <Icon name={t.icon} className="w-3 h-3" strokeWidth={2.6} />
            </span>
            Step {step + 1} of {STEPS.length}<span className="hidden sm:inline"> · {t.tagline}</span>
          </span>
          <span className="sm:hidden">{saveSlot}</span>
        </div>
        <h1 className="font-black text-white tracking-tight leading-[1.02]" style={{ fontSize: "clamp(2rem, 4.6vw, 3.5rem)" }}>
          {s.title}
        </h1>
        <p className="text-white/65 text-[15px] sm:text-lg mt-3 max-w-2xl leading-relaxed">{s.blurb}</p>
      </div>
      <div className="relative hidden sm:flex flex-col items-end gap-3 flex-shrink-0">
        <span>{saveSlot}</span>
        <div className="ideate-float">
          <StageArt stageId={s.id} className="w-36 h-28 lg:w-48 lg:h-40" />
        </div>
      </div>
    </div>
  );
}

// ─── Journey (desktop rail) ────────────────────────────────────────────

export function JourneyRail({ data, step, furthest, goTo }) {
  return (
    <nav aria-label="Steps">
      <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-white/35 mb-3 pl-2">Your journey</p>
      <ol>
        {STEPS.map((s, i) => {
          const t = STAGE_THEME[s.id];
          const unlocked = i <= furthest;
          const done = stepReady(s.id, data).ok;
          const active = i === step;
          const next = STEPS[i + 1];
          return (
            <li key={s.id} className="relative">
              {next && (
                <span
                  className="absolute left-[27px] top-[46px] h-[calc(100%-38px)] w-[2px] rounded-full transition-all duration-500"
                  style={{ background: i < furthest ? `linear-gradient(rgb(${t.rgb}), rgb(${STAGE_THEME[next.id].rgb}))` : "rgba(255,255,255,0.08)" }}
                />
              )}
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => goTo(i)}
                aria-current={active ? "step" : undefined}
                className="group relative w-full flex items-center gap-3 rounded-2xl p-2 pr-3 mb-1.5 text-left transition-all disabled:cursor-not-allowed hover:enabled:bg-white/[0.04]"
                style={active ? { background: `linear-gradient(90deg, rgba(${t.rgb}, 0.16), rgba(${t.rgb}, 0.02))`, boxShadow: `inset 0 0 0 1px rgba(${t.rgb}, 0.3)` } : undefined}
              >
                <span
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${active ? "ideate-pulse" : ""}`}
                  style={{
                    "--accent-rgb": t.rgb,
                    ...(active
                      ? { background: `rgb(${t.rgb})`, color: NAVY }
                      : done
                      ? { background: `rgba(${t.rgb}, 0.18)`, color: `rgb(${t.rgb})`, border: `1px solid rgba(${t.rgb}, 0.45)` }
                      : { background: "#0f1f42", color: unlocked ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.1)" }),
                  }}
                >
                  <Icon name={done && !active ? "check" : unlocked ? t.icon : "lock"} className="w-[18px] h-[18px]" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold" style={{ color: active ? "white" : unlocked ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)" }}>
                    {s.label}
                  </span>
                  <span className="block text-[11px] truncate" style={{ color: active ? `rgb(${t.rgb})` : "rgba(255,255,255,0.38)" }}>
                    {active ? "You are here" : done ? "Done" : unlocked ? t.tagline : "Locked"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Stepper (phones and tablets) ──────────────────────────────────────

export function MobileStepper({ data, step, furthest, goTo, navRef }) {
  const done = STEPS.filter((s) => stepReady(s.id, data).ok).length;
  return (
    <div className="lg:hidden mb-6">
      <nav ref={navRef} className="relative flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-1.5" aria-label="Steps">
        {STEPS.map((s, i) => {
          const t = STAGE_THEME[s.id];
          const unlocked = i <= furthest;
          const isDone = stepReady(s.id, data).ok;
          const active = i === step;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!unlocked}
              onClick={() => goTo(i)}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-2 pl-1 pr-3.5 py-1 rounded-full text-[13px] font-bold whitespace-nowrap transition-all disabled:cursor-not-allowed"
              style={active
                ? { background: `rgb(${t.rgb})`, color: NAVY, boxShadow: `0 8px 24px rgba(${t.rgb}, 0.35)` }
                : { background: "rgba(11,26,59,0.7)", color: unlocked ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={active ? { background: NAVY, color: `rgb(${t.rgb})` } : { background: isDone ? `rgba(${t.rgb}, 0.2)` : "rgba(255,255,255,0.06)", color: isDone ? `rgb(${t.rgb})` : "inherit" }}
              >
                <Icon name={isDone && !active ? "check" : unlocked ? t.icon : "lock"} className="w-3.5 h-3.5" strokeWidth={2.4} />
              </span>
              {s.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(done / STEPS.length) * 100}%`, background: "linear-gradient(90deg, #FFCB05, var(--accent))" }}
        />
      </div>
    </div>
  );
}

// ─── Live idea board ───────────────────────────────────────────────────

function BoardItem({ stageId, title, ready, empty, children }) {
  const t = STAGE_THEME[stageId];
  if (!ready) {
    return (
      <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
        <Icon name={t.icon} className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />
        <span className="text-[11px] text-white/30">{empty}</span>
      </div>
    );
  }
  return (
    <div className="ideate-pop relative rounded-xl p-3 pl-3.5 overflow-hidden" style={{ background: `linear-gradient(135deg, rgba(${t.rgb}, 0.12), rgba(255,255,255,0.02))`, border: `1px solid rgba(${t.rgb}, 0.22)` }}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: `rgb(${t.rgb})` }} />
      <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-black" style={{ color: `rgb(${t.rgb})` }}>
        <Icon name={t.icon} className="w-3 h-3" strokeWidth={2.4} /> {title}
      </p>
      <div className="mt-1 text-[13px] text-white/85 leading-snug">{children}</div>
    </div>
  );
}

export function IdeaBoard({ data }) {
  const done = STEPS.filter((s) => stepReady(s.id, data).ok).length;
  const chosen = data.stretch.ideas[data.stretch.chosen];
  const rating = CHECK_RATINGS.find((r) => r.id === data.check.rating);
  const answered = data.stress.objections.filter((o) => filled(o.answer)).length;
  const secs = pitchSeconds(data.pitch);
  const anyPitch = PITCH_BEATS.some((b) => filled(data.pitch[b.id]));

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <ProgressRing value={done / STEPS.length} size={40} stroke={4} color={MAIZE}>
          <span className="text-[11px] font-black text-white tabular-nums">{done}/{STEPS.length}</span>
        </ProgressRing>
        <div>
          <p className="text-sm font-bold text-white leading-tight">Your idea board</p>
          <p className="text-[11px] text-white/40">Builds as you go</p>
        </div>
      </div>
      <div className="space-y-2">
        <BoardItem stageId="spark" title="Spark" ready={filled(data.spark.idea)} empty="Your first idea lands here">
          &ldquo;{data.spark.idea}&rdquo;
        </BoardItem>
        <BoardItem stageId="dig" title={`Root problem · ${answeredRungs(data)} deep`} ready={stepReady("dig", data).ok} empty="Unlocks when you dig">
          {problemSentence(data)}
        </BoardItem>
        <BoardItem stageId="who" title="Persona" ready={filled(data.who.person)} empty="Meet your person">
          <span className="flex items-center gap-2">
            <Avatar text={data.who.person} size={26} rgb={STAGE_THEME.who.rgb} />
            <span className="font-semibold truncate">{personaName(data.who.person)}</span>
          </span>
        </BoardItem>
        <BoardItem stageId="check" title="Verdict" ready={Boolean(rating)} empty="Your reality check">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: rating ? `rgb(${RATING_COLORS[rating.id]})` : "transparent", boxShadow: rating ? `0 0 10px rgb(${RATING_COLORS[rating.id]})` : "none" }} />
            <span className="font-semibold">{rating?.label}</span>
            <span className="text-white/40 text-[11px]">· {data.check.talkedTo} asked</span>
          </span>
        </BoardItem>
        <BoardItem stageId="stretch" title={`Chosen from ${namedIdeas(data).length} ideas`} ready={Boolean(chosen && filled(chosen.text))} empty="Your chosen solution">
          <span className="font-semibold">{chosen?.text}</span>
        </BoardItem>
        <BoardItem stageId="stress" title={`Stress-tested · ${answered}/${OBJECTION_COUNT}`} ready={answered > 0 || filled(data.stress.assumption)} empty="Survive the skeptic">
          {filled(data.stress.assumption) ? data.stress.assumption : `${answered} objection${answered === 1 ? "" : "s"} answered`}
        </BoardItem>
        <BoardItem stageId="pitch" title={`Pitch · ${formatClock(secs)}`} ready={anyPitch} empty="Your pitch">
          <div className="pt-1"><PitchTimeline pitch={data.pitch} compact /></div>
        </BoardItem>
      </div>
    </div>
  );
}

export function BoardSheet({ data, open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your idea board">
      <button type="button" aria-label="Close board" onClick={onClose} className="ideate-fade absolute inset-0 w-full h-full" style={{ background: "rgba(3,8,20,0.65)" }} />
      <div className="ideate-sheet absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto no-scrollbar rounded-t-3xl px-5 pt-3 pb-8" style={{ background: "#0f1f42", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="mx-auto w-10 h-1 rounded-full mb-4" style={{ background: "rgba(255,255,255,0.2)" }} />
        <div className="flex justify-end -mb-10">
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white" style={SUBTLE}>
            <Icon name="x" className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>
        <IdeaBoard data={data} />
      </div>
    </div>
  );
}

export function BoardButton({ data, onOpen }) {
  const done = STEPS.filter((s) => stepReady(s.id, data).ok).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lg:hidden fixed bottom-5 right-4 z-30 inline-flex items-center gap-2 rounded-full pl-1.5 pr-4 py-1.5 text-sm font-bold shadow-2xl"
      style={{ background: "rgba(15,31,66,0.92)", color: "white", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <ProgressRing value={done / STEPS.length} size={34} stroke={3} color={MAIZE}>
        <Icon name="grid" className="w-3.5 h-3.5 text-white/80" />
      </ProgressRing>
      Board
    </button>
  );
}

// ─── Intro ─────────────────────────────────────────────────────────────

// A zigzag climbing up the map: even stops on the left, odd on the right,
// labels always on the outside so they never sit on the path.
const MAP_POINTS = Array.from({ length: 7 }, (_, i) => [i % 2 === 0 ? 170 : 350, 404 - i * 60]);

function JourneyMap() {
  const d = MAP_POINTS.reduce((path, [x, y], i) => {
    if (i === 0) return `M${x} ${y}`;
    const [px, py] = MAP_POINTS[i - 1];
    const my = (py + y) / 2;
    return `${path} C${px} ${my}, ${x} ${my}, ${x} ${y}`;
  }, "");
  return (
    <svg viewBox="0 0 520 440" className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="ideate-journey" x1="0" y1="1" x2="1" y2="0">
          {STEPS.map((s, i) => (
            <stop key={s.id} offset={i / (STEPS.length - 1)} stopColor={STAGE_THEME[s.id].accent} />
          ))}
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#ideate-journey)" strokeOpacity="0.25" strokeWidth="14" strokeLinecap="round" />
      <path d={d} fill="none" stroke="url(#ideate-journey)" strokeWidth="3" strokeDasharray="8 12" strokeLinecap="round" className="ideate-dash" />
      {MAP_POINTS.map(([x, y], i) => {
        const s = STEPS[i];
        const t = STAGE_THEME[s.id];
        const labelLeft = i % 2 === 0;
        return (
          <g key={s.id} className="ideate-pop" style={{ animationDelay: `${200 + i * 110}ms`, transformOrigin: `${x}px ${y}px` }}>
            <circle cx={x} cy={y} r="30" fill={t.accent} opacity="0.14" />
            <circle cx={x} cy={y} r="19" fill="#0B1A3B" stroke={t.accent} strokeWidth="3" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="900" fill={t.accent}>{i + 1}</text>
            <text x={labelLeft ? x - 40 : x + 40} y={y + 6} textAnchor={labelLeft ? "end" : "start"} fontSize="19" fontWeight="800" fill="#fff">{s.label}</text>
          </g>
        );
      })}
      <g className="ideate-twinkle">
        <path d="M200 16l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFCB05" />
      </g>
    </svg>
  );
}

export function Intro({ onStart }) {
  return (
    <div className="pb-10">
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-6 lg:gap-12 items-center pt-4 sm:pt-10">
        <div className="ideate-rise">
          <p className="text-xs sm:text-sm uppercase tracking-[0.3em] font-bold mb-4" style={{ color: MAIZE }}>10,000 Pitches · Ideate</p>
          <h1 className="font-black text-white tracking-tight leading-[0.98]" style={{ fontSize: "clamp(2.6rem, 6.4vw, 5.25rem)" }}>
            Build an idea{" "}
            <span style={{ background: "linear-gradient(90deg, #FFCB05, #FF8A3D 45%, #F472B6 80%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              worth pitching
            </span>
          </h1>
          <p className="mt-6 text-white/70 text-base sm:text-xl max-w-xl leading-relaxed">
            Seven short stops take you from a rough idea to a real problem, a solution you&rsquo;ve stress-tested, and a 60 to 90 second pitch you can record. Your work saves as you go.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <PrimaryButton onClick={onStart} className="px-7 py-4 text-base">
              Start building <Icon name="arrowRight" className="w-5 h-5" strokeWidth={2.4} />
            </PrimaryButton>
            <span className="text-sm text-white/45">7 steps · saves as you go</span>
          </div>
          <div className="mt-8 flex items-center gap-3 max-w-lg rounded-2xl p-3.5 pr-4" style={{ background: "rgba(255,203,5,0.06)", border: "1px solid rgba(255,203,5,0.2)" }}>
            <CoachOrb size={40} />
            <p className="text-[13px] sm:text-sm text-white/75 leading-relaxed">
              A UMGPT coach asks questions, finds gaps and argues with you. You always write first, and it never writes your idea for you. You can ask for help {DAILY_COACH_LIMIT} times a day.
            </p>
          </div>
        </div>
        <div className="ideate-rise max-w-md lg:max-w-none w-full mx-auto" style={{ animationDelay: "120ms" }}>
          <JourneyMap />
        </div>
      </section>

      <section className="mt-12 sm:mt-16">
        <h2 className="text-[11px] uppercase tracking-[0.3em] font-bold text-white/40 mb-4">How it works</h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {STEPS.map((s, i) => {
            const t = STAGE_THEME[s.id];
            return (
              <li
                key={s.id}
                className="ideate-rise relative rounded-2xl p-4 sm:p-5 overflow-hidden"
                style={{ background: `linear-gradient(150deg, rgba(${t.rgb}, 0.14), rgba(255,255,255,0.02) 60%)`, border: `1px solid rgba(${t.rgb}, 0.22)`, animationDelay: `${i * 60}ms` }}
              >
                <span className="absolute -right-3 -top-5 text-7xl font-black" style={{ color: "transparent", WebkitTextStroke: `1px rgba(${t.rgb}, 0.25)` }}>{i + 1}</span>
                <span className="relative w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `rgb(${t.rgb})`, color: NAVY }}>
                  <Icon name={t.icon} className="w-5 h-5" strokeWidth={2.2} />
                </span>
                <p className="relative mt-3 text-base font-black text-white">{s.label}</p>
                <p className="relative text-[13px] font-semibold" style={{ color: `rgb(${t.rgb})` }}>{s.title}</p>
                <p className="relative text-xs text-white/55 mt-1.5 leading-relaxed">{s.blurb}</p>
              </li>
            );
          })}
          <li className="ideate-rise rounded-2xl p-4 sm:p-5 flex flex-col justify-between" style={{ ...SUBTLE, animationDelay: "420ms" }}>
            <Icon name="mic" className="w-7 h-7" style={{ color: MAIZE }} />
            <div>
              <p className="mt-3 text-base font-black text-white">Then record it</p>
              <p className="text-xs text-white/55 mt-1.5 leading-relaxed">You finish with an idea card and a pitch outline, ready to film or record.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}

// ─── Summary ───────────────────────────────────────────────────────────

function Confetti() {
  const pieces = useMemo(() => {
    const colors = STEPS.map((s) => STAGE_THEME[s.id].accent);
    return Array.from({ length: 44 }, (_, i) => ({
      left: `${(i * 97) % 100}%`,
      color: colors[i % colors.length],
      delay: `${((i * 37) % 60) / 100}s`,
      dur: `${2.4 + ((i * 13) % 14) / 10}s`,
      drift: `${((i * 53) % 160) - 80}px`,
      spin: `${360 + ((i * 71) % 540)}deg`,
      round: i % 3 === 0,
    }));
  }, []);
  return (
    <div aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="ideate-confetti"
          style={{ left: p.left, background: p.color, borderRadius: p.round ? "9999px" : "2px", width: p.round ? 9 : 8, height: p.round ? 9 : 14, "--delay": p.delay, "--dur": p.dur, "--drift": p.drift, "--spin": p.spin }}
        />
      ))}
    </div>
  );
}

// Text on the idea card that can be fixed in place: looks like plain text
// until hovered or focused, then shows a soft field outline.
function EditableText({ value, onChange, label, singleLine = false, maxLength = LONG_TEXT, className = "" }) {
  return (
    <AutoTextarea
      bare
      rows={1}
      maxLength={maxLength}
      value={value}
      aria-label={label}
      placeholder="Empty. Click to write something"
      onChange={(v) => onChange(singleLine ? v.replace(/\n/g, " ") : v)}
      onKeyDown={singleLine ? (e) => { if (e.key === "Enter") e.preventDefault(); } : undefined}
      className={`ideate-editable block rounded-lg -mx-2 px-2 py-1 ${className}`}
      style={{ width: "calc(100% + 1rem)" }}
    />
  );
}

function SummaryTile({ stageId, title, children }) {
  const t = STAGE_THEME[stageId];
  return (
    <div className="rounded-2xl p-5 sm:p-6 relative overflow-hidden" style={{ background: `linear-gradient(150deg, rgba(${t.rgb}, 0.13), rgba(255,255,255,0.02) 60%)`, border: `1px solid rgba(${t.rgb}, 0.25)`, "--accent-rgb": t.rgb }}>
      <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-black" style={{ color: `rgb(${t.rgb})` }}>
        <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `rgb(${t.rgb})`, color: NAVY }}>
          <Icon name={t.icon} className="w-3.5 h-3.5" strokeWidth={2.4} />
        </span>
        {title}
      </p>
      <div className="mt-3 text-[15px] text-white/90 leading-relaxed">{children}</div>
    </div>
  );
}

function Connector({ children }) {
  return <p className="text-xs italic text-white/40 my-0.5">{children}</p>;
}

export function ideaAsText(d) {
  const chosen = d.stretch.ideas[d.stretch.chosen];
  return [
    `IDEA: ${chosen?.text || d.spark.idea}`,
    "",
    `PROBLEM: ${problemSentence(d)}`,
    `PERSON: ${d.who.person}`,
    `TODAY THEY: ${d.who.today}`,
    `SOLUTION: ${d.stretch.solution}`,
    `RISKIEST ASSUMPTION: ${d.stress.assumption}`,
    `TEST THIS WEEK: ${d.stress.test}`,
    "",
    "PITCH OUTLINE (60 to 90 seconds)",
    ...PITCH_BEATS.map((b) => `${b.label} (up to ${b.seconds}s): ${d.pitch[b.id]}`),
  ].join("\n");
}

export function Summary({ data, update, celebrate, saveSlot, onEdit, onReset }) {
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const chosenIndex = data.stretch.chosen;
  const chosen = data.stretch.ideas[chosenIndex];
  const coachNotes = Object.values(data.coach || {}).reduce((n, list) => n + list.length, 0);
  const secs = pitchSeconds(data.pitch);
  const status = pitchStatus(secs);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ideaAsText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const stats = [
    { icon: "dig", rgb: STAGE_THEME.dig.rgb, value: answeredRungs(data), label: "whys deep" },
    { icon: "users", rgb: STAGE_THEME.check.rgb, value: data.check.talkedTo, label: "people asked" },
    { icon: "branch", rgb: STAGE_THEME.stretch.rgb, value: namedIdeas(data).length, label: "ideas explored" },
    { icon: "shield", rgb: STAGE_THEME.stress.rgb, value: data.stress.objections.length, label: "objections faced" },
    { icon: "sparkles", rgb: "255, 203, 5", value: coachNotes, label: "coach notes" },
  ];

  let start = 0;
  return (
    <div className="pb-12 pt-2 sm:pt-4">
      {celebrate && <Confetti />}

      <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] lg:gap-8 xl:gap-12 lg:items-start">
        {/* The idea itself stays in view while the card scrolls. */}
        <aside className="ideate-rise lg:sticky lg:top-[104px] lg:max-h-[calc(100dvh-128px)] lg:overflow-y-auto no-scrollbar">
          <div
            className="relative rounded-3xl p-6 sm:p-7 overflow-hidden"
            style={{ background: "radial-gradient(ellipse at 0% 0%, rgba(255,203,5,0.18), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(244,114,182,0.14), transparent 55%), rgba(11,26,59,0.75)", border: "1px solid rgba(255,203,5,0.3)", "--accent-rgb": "255, 203, 5" }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-black" style={{ background: "rgba(255,203,5,0.14)", color: MAIZE, border: "1px solid rgba(255,203,5,0.35)" }}>
                <Icon name="star" className="w-3.5 h-3.5" strokeWidth={2.4} /> Your idea card
              </span>
              {saveSlot}
            </div>
            <p className="mt-5 text-xs text-white/40 leading-relaxed line-clamp-3">
              Started as <span className="line-through decoration-white/30">&ldquo;{data.spark.idea}&rdquo;</span>
            </p>
            <Icon name="arrowDown" className="w-4 h-4 mt-2 text-white/30 ideate-bob" />
            <div className="mt-2">
              {chosen ? (
                <EditableText
                  label="Your idea"
                  singleLine
                  maxLength={SHORT_TEXT}
                  value={chosen.text}
                  onChange={(v) => update((x) => { if (x.stretch.ideas[chosenIndex]) x.stretch.ideas[chosenIndex].text = v; })}
                  className="text-2xl sm:text-[28px] font-black text-white leading-tight tracking-tight"
                />
              ) : (
                <p className="text-2xl font-black text-white leading-tight">{data.spark.idea}</p>
              )}
              <div className="mt-3 h-1 w-16 rounded-full" style={{ background: "linear-gradient(90deg, #FFCB05, #F472B6)" }} />
            </div>

            <div className="mt-6 flex flex-wrap gap-1.5">
              {stats.map((st) => (
                <span key={st.label} className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-[11px] text-white/65" style={SUBTLE}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: tint(st.rgb, 0.18), color: `rgb(${st.rgb})` }}>
                    <Icon name={st.icon} className="w-3 h-3" strokeWidth={2.2} />
                  </span>
                  <span className="font-black text-white tabular-nums">{st.value}</span> {st.label}
                </span>
              ))}
            </div>

            <div className="mt-6 grid gap-2.5">
              <PrimaryButton onClick={copy} className="w-full">
                <Icon name={copied ? "check" : "copy"} className="w-4 h-4" strokeWidth={2.4} />
                {copied ? "Copied" : "Copy my idea card"}
              </PrimaryButton>
              <GhostButton onClick={onEdit} className="w-full">Back to the steps</GhostButton>
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {confirmReset ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-xs text-white/60">This clears everything you wrote. Start over?</span>
                  <button type="button" onClick={onReset} className="text-xs font-bold text-red-300 hover:text-red-200">Yes, start a new idea</button>
                  <button type="button" onClick={() => setConfirmReset(false)} className="text-xs text-white/45 hover:text-white/75">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70">
                  <Icon name="refresh" className="w-3.5 h-3.5" /> Start a new idea
                </button>
              )}
            </div>
          </div>
        </aside>

        <div className="mt-6 lg:mt-0 min-w-0 space-y-4">
          <p className="ideate-rise flex items-center gap-2 text-xs text-white/50 px-1">
            <Icon name="wrench" className="w-3.5 h-3.5" style={{ color: MAIZE }} />
            Spotted a typo? Click any text on the card to fix it. Changes save automatically.
          </p>

          <div className="ideate-rise" style={{ animationDelay: "80ms" }}>
            <SummaryTile stageId="dig" title="The problem">
              <div className="font-semibold">
                <EditableText label="Who has the problem" singleLine maxLength={SHORT_TEXT} value={data.dig.who} onChange={(v) => update((x) => { x.dig.who = v; })} />
                <Connector>struggles with</Connector>
                <EditableText label="What they struggle with" singleLine maxLength={SHORT_TEXT} value={data.dig.what} onChange={(v) => update((x) => { x.dig.what = v; })} />
                <Connector>because</Connector>
                <EditableText label="Why it happens" singleLine maxLength={SHORT_TEXT} value={data.dig.why} onChange={(v) => update((x) => { x.dig.why = v; })} />
              </div>
            </SummaryTile>
          </div>

          <div className="ideate-rise" style={{ animationDelay: "130ms" }}>
            <SummaryTile stageId="who" title="The person">
              <div className="flex items-start gap-4">
                <Avatar text={data.who.person} size={44} rgb={STAGE_THEME.who.rgb} />
                <div className="min-w-0 flex-1">
                  <EditableText label="The person" value={data.who.person} onChange={(v) => update((x) => { x.who.person = v; })} />
                  <p className="mt-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/35">What they do today</p>
                  <EditableText label="What they do today" value={data.who.today} onChange={(v) => update((x) => { x.who.today = v; })} className="text-sm text-white/65" />
                </div>
              </div>
            </SummaryTile>
          </div>

          <div className="ideate-rise" style={{ animationDelay: "180ms" }}>
            <SummaryTile stageId="stretch" title="The solution">
              <EditableText label="The solution" value={data.stretch.solution} onChange={(v) => update((x) => { x.stretch.solution = v; })} />
            </SummaryTile>
          </div>

          <div className="ideate-rise" style={{ animationDelay: "230ms" }}>
            <SummaryTile stageId="stress" title="Riskiest assumption">
              <EditableText label="Riskiest assumption" value={data.stress.assumption} onChange={(v) => update((x) => { x.stress.assumption = v; })} />
              <div className="mt-3 flex items-start gap-2">
                <Icon name="flask" className="w-4 h-4 flex-shrink-0 mt-2" style={{ color: "#34D399" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/35 mt-1.5">Test this week</p>
                  <EditableText label="Test this week" value={data.stress.test} onChange={(v) => update((x) => { x.stress.test = v; })} className="text-sm text-white/65" />
                </div>
              </div>
            </SummaryTile>
          </div>

          <section className="ideate-rise rounded-3xl p-5 sm:p-7" style={{ ...GLASS, animationDelay: "280ms", "--accent-rgb": STAGE_THEME.pitch.rgb }}>
            <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] font-black" style={{ color: STAGE_THEME.pitch.accent }}>Your pitch</p>
                <p className="text-3xl sm:text-4xl font-black tabular-nums mt-1" style={{ color: `rgb(${status.rgb})` }}>{formatClock(secs)}</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold" style={{ background: tint(status.rgb, 0.14), color: `rgb(${status.rgb})`, border: `1px solid ${tint(status.rgb, 0.35)}` }}>
                <Icon name="clock" className="w-3.5 h-3.5" /> {status.text}
              </span>
            </div>
            <PitchTimeline pitch={data.pitch} />
            <ol className="mt-6 grid gap-3">
              {PITCH_BEATS.map((b) => {
                const rgb = BEAT_COLORS[b.id];
                const from = start;
                start += b.seconds;
                return (
                  <li key={b.id} className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-4 rounded-xl p-3.5 sm:p-4" style={{ background: `linear-gradient(90deg, ${tint(rgb, 0.1)}, transparent 60%)`, borderLeft: `3px solid rgb(${rgb})`, "--accent-rgb": rgb }}>
                    <span className="sm:pt-1">
                      <span className="block text-sm font-black text-white">{b.label}</span>
                      <span className="block text-[11px] font-mono tabular-nums" style={{ color: `rgb(${rgb})` }}>{formatClock(from)}–{formatClock(from + b.seconds)}</span>
                    </span>
                    <EditableText label={b.label} value={data.pitch[b.id]} onChange={(v) => update((x) => { x.pitch[b.id] = v; })} className="text-[15px] text-white/85 leading-relaxed" />
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="ideate-rise relative rounded-3xl p-6 sm:p-8 overflow-hidden" style={{ background: "radial-gradient(ellipse at 90% 10%, rgba(96,165,250,0.22), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(255,203,5,0.14), transparent 55%), rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", animationDelay: "330ms" }}>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Now go record it</h2>
                <p className="text-sm sm:text-base text-white/65 mt-2 leading-relaxed max-w-xl">
                  Pitches are best heard. Record yourself on video or audio and talk through these beats in your own words rather than reading them out. A couple of takes is normal.
                </p>
              </div>
              <div className="hidden sm:block ideate-float" style={{ "--accent": STAGE_THEME.pitch.accent }}>
                <StageArt stageId="pitch" className="w-36 h-28" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
