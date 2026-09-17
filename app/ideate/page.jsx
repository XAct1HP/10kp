"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import PageBackground from "../../components/PageBackground";
import rulesBg from "../../public/rules_bg.png";
import { supabase } from "../../lib/supabase";
import {
  STEPS,
  DOORS,
  LENSES,
  CHECK_RATINGS,
  PITCH_BEATS,
  FALLBACK_WHY,
  FALLBACK_OBJECTIONS,
  COACH_PREREQS,
  COACH_HISTORY,
  DAILY_COACH_LIMIT,
  MAX_RUNGS,
  MIN_IDEAS,
  MAX_IDEAS,
  OBJECTION_COUNT,
  PITCH_SECONDS,
  SHORT_TEXT,
  LONG_TEXT,
  emptyIdeateData,
  stepReady,
  furthestUnlocked,
  namedIdeas,
  answeredRungs,
  wordCount,
  pitchSeconds,
  WORDS_PER_SECOND,
} from "../../lib/ideate/curriculum";

// ─── Look ──────────────────────────────────────────────────────────────

const MAIZE = "#FFCB05";
const NAVY = "#0B1A3B";

const GLASS = {
  background: "rgba(11,26,59,0.6)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
};
const INPUT = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
const SUBTLE = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" };

// ─── Plumbing ──────────────────────────────────────────────────────────

let latestToken = null;

async function authedFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  latestToken = session?.access_token || null;
  return fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(latestToken ? { Authorization: `Bearer ${latestToken}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// The problem statement is stitched from three inputs; start it with a capital.
function problemSentence(d) {
  const text = `${d.dig.who.trim()} struggles with ${d.dig.what.trim()} because ${d.dig.why.trim()}`.replace(/[.\s]+$/, "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

// ─── Small pieces ──────────────────────────────────────────────────────

function AutoTextarea({ value, onChange, placeholder, rows = 2, maxLength = LONG_TEXT, className = "", ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-4 py-3 rounded-xl text-sm sm:text-[15px] text-white placeholder-white/25 leading-relaxed resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-maize/50 ${className}`}
      style={INPUT}
      {...rest}
    />
  );
}

function TextInput({ value, onChange, placeholder, maxLength = SHORT_TEXT, className = "", ...rest }) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-4 py-3 rounded-xl text-sm sm:text-[15px] text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-maize/50 ${className}`}
      style={INPUT}
      {...rest}
    />
  );
}

function Field({ label, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-white mb-1">{label}</label>
      {hint && <p className="text-xs text-white/45 leading-relaxed mb-2.5">{hint}</p>}
      {children}
    </div>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <p className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: MAIZE }}>
        {children}
      </p>
      {right}
    </div>
  );
}

function Dot() {
  return <span className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: MAIZE }} />;
}

function SparkIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M8.757 15.243l-2.121 2.121m12.728 0l-2.121-2.121M8.757 8.757L6.636 6.636" />
    </svg>
  );
}

function PrimaryButton({ children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:enabled:-translate-y-0.5 ${className}`}
      style={{ background: MAIZE, color: NAVY }}
      {...rest}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white/80 hover:enabled:text-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${className}`}
      style={{ border: "1px solid rgba(255,255,255,0.15)" }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Coach ─────────────────────────────────────────────────────────────

function CoachReply({ reply }) {
  return (
    <div className="space-y-3">
      {reply.message && <p className="text-sm text-white/85 leading-relaxed">{reply.message}</p>}
      {reply.bullets?.length > 0 && (
        <ul className="space-y-2">
          {reply.bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
              <Dot />
              <span>
                {b.label && <span className="font-semibold text-white">{b.label}: </span>}
                <span className="text-white/70">{b.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {reply.question && (
        <p className="text-sm text-white/90 leading-relaxed pl-3 italic" style={{ borderLeft: `2px solid ${MAIZE}` }}>
          {reply.question}
        </p>
      )}
    </div>
  );
}

function coachLeft(usage) {
  if (!usage) return DAILY_COACH_LIMIT;
  return Math.max(0, usage.limit - usage.used);
}

function CoachPanel({ data, actions, replies = [], busyMode, error, usage, onAsk }) {
  const [showOlder, setShowOlder] = useState(false);
  const left = coachLeft(usage);
  const latest = replies[replies.length - 1];
  const older = replies.slice(0, -1).reverse();

  return (
    <div className="rounded-2xl p-4 sm:p-5 mt-8" style={{ background: "rgba(255,203,5,0.05)", border: "1px solid rgba(255,203,5,0.2)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,203,5,0.15)", color: MAIZE }}>
            <SparkIcon />
          </span>
          <span className="text-sm font-semibold text-white">Coach</span>
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}>
            UMGPT
          </span>
        </div>
        <span className="text-[11px] text-white/40 tabular-nums">{left} left today</span>
      </div>
      <p className="text-xs text-white/45 mt-2 leading-relaxed">
        The coach asks questions and pushes back. It won&rsquo;t do the thinking for you.
      </p>

      <div className="flex flex-wrap gap-2 mt-3">
        {actions.map((a) => {
          const blocked = COACH_PREREQS[a.mode](data);
          return (
            <button
              key={a.mode}
              type="button"
              disabled={Boolean(blocked) || Boolean(busyMode) || left === 0}
              onClick={() => onAsk(a.mode)}
              title={blocked || undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(255,203,5,0.12)", color: MAIZE, border: "1px solid rgba(255,203,5,0.25)" }}
            >
              {busyMode === a.mode ? "Thinking…" : a.label}
            </button>
          );
        })}
      </div>
      {actions.length === 1 && COACH_PREREQS[actions[0].mode](data) && (
        <p className="text-[11px] text-white/35 mt-2">{COACH_PREREQS[actions[0].mode](data)}</p>
      )}

      {busyMode && actions.some((a) => a.mode === busyMode) && (
        <div className="mt-4 flex items-center gap-2 text-xs text-white/50">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: MAIZE }} />
          Reading what you wrote…
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      {latest && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,203,5,0.15)" }}>
          <CoachReply reply={latest} />
        </div>
      )}
      {older.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowOlder((v) => !v)} className="text-[11px] text-white/40 hover:text-white/70 transition-colors">
            {showOlder ? "Hide earlier notes" : `Earlier notes (${older.length})`}
          </button>
          {showOlder && (
            <div className="mt-3 space-y-4">
              {older.map((r, i) => (
                <div key={`${r.at}-${i}`} className="rounded-xl p-3.5" style={SUBTLE}>
                  <CoachReply reply={r} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Steps ─────────────────────────────────────────────────────────────

function SparkStep({ data, update }) {
  const door = DOORS.find((d) => d.id === data.spark.door);
  return (
    <div className="space-y-7">
      <div>
        <SectionLabel>Pick a way in</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {DOORS.map((d) => {
            const on = data.spark.door === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => update((x) => { x.spark.door = d.id; })}
                className="text-left rounded-xl p-4 transition-all"
                style={on ? { background: "rgba(255,203,5,0.1)", border: `1px solid ${MAIZE}` } : SUBTLE}
              >
                <span className="block text-sm font-semibold" style={{ color: on ? MAIZE : "white" }}>{d.title}</span>
              </button>
            );
          })}
        </div>
        {door && <p className="text-sm text-white/60 mt-3 leading-relaxed">{door.prompt}</p>}
      </div>

      <Field label="Your idea in one sentence" hint="Rough is fine. “A better toothbrush” is a perfectly good place to start.">
        <TextInput
          value={data.spark.idea}
          onChange={(v) => update((x) => { x.spark.idea = v; })}
          placeholder="e.g. A better way to find study space on North Campus"
        />
      </Field>
    </div>
  );
}

function DigStep({ data, update, askCoach, coachProps }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const rungs = data.dig.rungs;
  const last = rungs[rungs.length - 1];
  const canDig = rungs.length < MAX_RUNGS && last && last.answer.trim();

  const digDeeper = async () => {
    setBusy(true);
    setNote("");
    const { reply, error } = await askCoach("dig-next");
    update((x) => {
      if (x.dig.rungs.length < MAX_RUNGS) x.dig.rungs.push({ question: reply?.question || FALLBACK_WHY, answer: "" });
    });
    setNote(reply ? reply.message : `${error} Here's a standard question instead.`);
    setBusy(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <SectionLabel right={<span className="text-[11px] text-white/35">{answeredRungs(data)} of {MAX_RUNGS} levels</span>}>
          Keep asking why
        </SectionLabel>
        <div className="rounded-xl px-4 py-3 mb-4 text-sm text-white/70" style={SUBTLE}>
          <span className="text-white/40">Your spark: </span>
          {data.spark.idea}
        </div>

        <ol className="space-y-4">
          {rungs.map((r, i) => (
            <li key={i} className="relative pl-9">
              <span
                className="absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{ background: i === rungs.length - 1 ? MAIZE : "rgba(255,203,5,0.15)", color: i === rungs.length - 1 ? NAVY : MAIZE }}
              >
                {i + 1}
              </span>
              {i < rungs.length - 1 && (
                <span className="absolute left-3 top-8 bottom-[-12px] w-px" style={{ background: "rgba(255,203,5,0.2)" }} />
              )}
              <p className="text-sm font-semibold text-white mb-2 leading-snug">{r.question}</p>
              <AutoTextarea
                value={r.answer}
                onChange={(v) => update((x) => { x.dig.rungs[i].answer = v; })}
                placeholder="Answer honestly. Specifics beat big words."
              />
              {i === rungs.length - 1 && i > 0 && !r.answer.trim() && (
                <button
                  type="button"
                  onClick={() => { update((x) => { x.dig.rungs.pop(); }); setNote(""); }}
                  className="mt-1.5 text-[11px] text-white/35 hover:text-white/60"
                >
                  Remove this question
                </button>
              )}
            </li>
          ))}
        </ol>

        {note && <p className="text-xs text-white/55 mt-4 pl-9 leading-relaxed">{note}</p>}

        {rungs.length < MAX_RUNGS ? (
          <div className="mt-4 pl-9 flex flex-wrap items-center gap-3">
            <GhostButton onClick={digDeeper} disabled={!canDig || busy}>
              <SparkIcon className="w-3.5 h-3.5" />
              {busy ? "Finding the next question…" : "Dig deeper"}
            </GhostButton>
            {!canDig && <span className="text-[11px] text-white/35">Answer the question above first.</span>}
          </div>
        ) : (
          <p className="mt-4 pl-9 text-xs text-white/45">That&rsquo;s five levels. Time to write down the problem you found.</p>
        )}
      </div>

      <div>
        <SectionLabel>Your problem statement</SectionLabel>
        <p className="text-xs text-white/45 mb-3 leading-relaxed">
          Write down the deepest real problem you reached. Describe the problem, not your solution. &ldquo;There&rsquo;s no app for it&rdquo; is a solution in disguise.
        </p>
        <div className="grid grid-cols-1 gap-2.5">
          <TextInput value={data.dig.who} onChange={(v) => update((x) => { x.dig.who = v; })} placeholder="Who: e.g. commuter students with back-to-back classes" />
          <p className="text-xs text-white/40 pl-1">struggles with</p>
          <TextInput value={data.dig.what} onChange={(v) => update((x) => { x.dig.what = v; })} placeholder="What: the specific struggle" />
          <p className="text-xs text-white/40 pl-1">because</p>
          <TextInput value={data.dig.why} onChange={(v) => update((x) => { x.dig.why = v; })} placeholder="Why: the root cause you dug up" />
        </div>
      </div>

      <CoachPanel {...coachProps} actions={[{ mode: "dig-problem", label: "Pressure-test my statement" }]} />
    </div>
  );
}

function WhoStep({ data, update, coachProps }) {
  return (
    <div className="space-y-6">
      <Field label="Who is one specific person with this problem?" hint="Give them a name, an age, a situation. Not “students.” More like: a first-year commuting from Ypsi who works nights.">
        <AutoTextarea value={data.who.person} onChange={(v) => update((x) => { x.who.person = v; })} placeholder="Describe them…" />
      </Field>
      <Field label="When did it last happen to them?" hint="Walk through the moment: where they were, what went wrong, how it felt.">
        <AutoTextarea value={data.who.lastTime} onChange={(v) => update((x) => { x.who.lastTime = v; })} placeholder="Last Tuesday, they…" />
      </Field>
      <Field label="What do they do about it today?" hint="A clumsy workaround is a good sign: it means the pain is real. If they do nothing, ask yourself whether it really hurts.">
        <AutoTextarea value={data.who.today} onChange={(v) => update((x) => { x.who.today = v; })} placeholder="Right now they…" />
      </Field>
      <CoachPanel {...coachProps} actions={[{ mode: "who-sharpen", label: "Is this specific enough?" }]} />
    </div>
  );
}

function CheckStep({ data, update, coachProps, goTo }) {
  const rating = CHECK_RATINGS.find((r) => r.id === data.check.rating);
  const ratingColor = { green: "#34D399", yellow: MAIZE, red: "#F87171" };
  return (
    <div className="space-y-6">
      <Field label="What do people use today?" hint="List everything you know of: products, apps, services, workarounds. “Nothing, they just put up with it” is an answer too.">
        <AutoTextarea value={data.check.existing} onChange={(v) => update((x) => { x.check.existing = v; })} placeholder="Today people…" />
      </Field>
      <Field label="How many people have this, and how often?" hint="A rough guess is fine. How could you find out for real?">
        <AutoTextarea value={data.check.scale} onChange={(v) => update((x) => { x.check.scale = v; })} placeholder="My guess is…" />
      </Field>
      <Field label="Who would pay for a fix?" hint="Not always the person with the problem: parents, a school, an employer, an insurer, advertisers…">
        <AutoTextarea value={data.check.payer} onChange={(v) => update((x) => { x.check.payer = v; })} placeholder="The one paying would be…" />
      </Field>

      <div className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between" style={SUBTLE}>
        <div>
          <p className="text-sm font-semibold text-white">Real people I&rsquo;ve asked about this</p>
          <p className="text-xs text-white/45 mt-0.5 leading-relaxed">Ask three people before you choose a solution. It&rsquo;s the fastest reality check there is.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" aria-label="Fewer" onClick={() => update((x) => { x.check.talkedTo = Math.max(0, x.check.talkedTo - 1); })} className="w-8 h-8 rounded-lg text-white/70 hover:text-white" style={INPUT}>−</button>
          <span className="w-8 text-center text-lg font-bold tabular-nums" style={{ color: data.check.talkedTo >= 3 ? MAIZE : "white" }}>{data.check.talkedTo}</span>
          <button type="button" aria-label="More" onClick={() => update((x) => { x.check.talkedTo = Math.min(99, x.check.talkedTo + 1); })} className="w-8 h-8 rounded-lg text-white/70 hover:text-white" style={INPUT}>+</button>
        </div>
      </div>

      <CoachPanel {...coachProps} actions={[{ mode: "check-research", label: "Find what I missed" }]} />

      <div>
        <SectionLabel>Your honest verdict</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {CHECK_RATINGS.map((r) => {
            const on = data.check.rating === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => update((x) => { x.check.rating = r.id; })}
                className="text-left rounded-xl p-4 transition-all"
                style={on ? { background: "rgba(255,255,255,0.06)", border: `1px solid ${ratingColor[r.id]}` } : SUBTLE}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ratingColor[r.id] }} />
                  <span className="text-sm font-semibold text-white">{r.label}</span>
                </span>
                <span className="block text-xs text-white/50 mt-1.5 leading-relaxed">{r.hint}</span>
              </button>
            );
          })}
        </div>
        {rating?.id === "red" && (
          <div className="mt-3">
            <GhostButton onClick={() => goTo(1)}>← Back to Dig</GhostButton>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreDots({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/40 w-14">{label}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${label} ${n}`}
          onClick={() => onChange(value === n ? 0 : n)}
          className="w-4 h-4 rounded-full transition-colors"
          style={{ background: n <= value ? MAIZE : "rgba(255,255,255,0.1)" }}
        />
      ))}
    </div>
  );
}

function StretchStep({ data, update, coachProps }) {
  const [draft, setDraft] = useState("");
  const [lensId, setLensId] = useState("");
  const [lensDraft, setLensDraft] = useState("");
  const ideas = data.stretch.ideas;
  const count = namedIdeas(data).length;
  const unlocked = count >= MIN_IDEAS;
  const lens = LENSES.find((l) => l.id === lensId);
  const full = ideas.length >= MAX_IDEAS;

  const addIdea = (text, lensTag = "") => {
    const t = text.trim();
    if (!t || full) return;
    update((x) => { x.stretch.ideas.push({ text: t, lens: lensTag, impact: 0, doable: 0, excite: 0 }); });
  };

  const removeIdea = (i) =>
    update((x) => {
      x.stretch.ideas.splice(i, 1);
      if (x.stretch.chosen === i) x.stretch.chosen = -1;
      else if (x.stretch.chosen > i) x.stretch.chosen -= 1;
    });

  const chosen = ideas[data.stretch.chosen];

  return (
    <div className="space-y-8">
      <div className="rounded-xl px-4 py-3 text-sm text-white/75 leading-relaxed" style={SUBTLE}>
        <span className="text-white/40">Solving: </span>
        {problemSentence(data)}
      </div>

      <div>
        <SectionLabel right={<span className="text-[11px] tabular-nums" style={{ color: unlocked ? MAIZE : "rgba(255,255,255,0.35)" }}>{count} ideas{unlocked ? "" : ` · ${MIN_IDEAS} to unlock the next part`}</span>}>
          1 · Go wide on your own
        </SectionLabel>
        <p className="text-xs text-white/45 mb-3 leading-relaxed">Quantity first. Silly ideas count, and often lead somewhere good. Don&rsquo;t judge anything yet.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); addIdea(draft); setDraft(""); }}
        >
          <TextInput value={draft} onChange={setDraft} placeholder={full ? "That's plenty of ideas" : "Another way to solve it…"} disabled={full} />
          <PrimaryButton type="submit" disabled={!draft.trim() || full} className="flex-shrink-0">Add</PrimaryButton>
        </form>

        {ideas.length > 0 && (
          <ul className="mt-4 space-y-2">
            {ideas.map((idea, i) => {
              const picked = data.stretch.chosen === i;
              const total = idea.impact + idea.doable + idea.excite;
              const lensName = LENSES.find((l) => l.id === idea.lens)?.title;
              return (
                <li key={i} className="rounded-xl p-3 sm:p-3.5" style={picked ? { background: "rgba(255,203,5,0.08)", border: `1px solid ${MAIZE}` } : SUBTLE}>
                  <div className="flex items-start gap-3">
                    <span className="text-[11px] text-white/30 tabular-nums mt-2.5 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <input
                        value={idea.text}
                        maxLength={SHORT_TEXT}
                        onChange={(e) => update((x) => { x.stretch.ideas[i].text = e.target.value; })}
                        className="w-full bg-transparent text-sm text-white py-2 focus:outline-none"
                      />
                      {lensName && <span className="text-[10px] uppercase tracking-wider text-white/35">via {lensName}</span>}
                      {unlocked && (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2">
                          <ScoreDots label="Impact" value={idea.impact} onChange={(n) => update((x) => { x.stretch.ideas[i].impact = n; })} />
                          <ScoreDots label="Doable" value={idea.doable} onChange={(n) => update((x) => { x.stretch.ideas[i].doable = n; })} />
                          <ScoreDots label="Excites" value={idea.excite} onChange={(n) => update((x) => { x.stretch.ideas[i].excite = n; })} />
                          {total > 0 && <span className="text-[11px] text-white/45 tabular-nums">{total}/15</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {unlocked && idea.text.trim() && (
                        <button
                          type="button"
                          onClick={() => update((x) => { x.stretch.chosen = picked ? -1 : i; })}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                          style={picked ? { background: MAIZE, color: NAVY } : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}
                        >
                          {picked ? "Chosen" : "Choose"}
                        </button>
                      )}
                      <button type="button" onClick={() => removeIdea(i)} className="text-[11px] text-white/30 hover:text-red-300 px-1" aria-label="Remove idea">
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={unlocked ? "" : "opacity-40 pointer-events-none select-none"} aria-disabled={!unlocked}>
        <SectionLabel>2 · Look through a lens</SectionLabel>
        <p className="text-xs text-white/45 mb-3 leading-relaxed">Pick a card and push yourself to come up with at least one idea that fits it.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LENSES.map((l) => {
            const on = lensId === l.id;
            const used = ideas.some((i) => i.lens === l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => { setLensId(on ? "" : l.id); setLensDraft(""); }}
                className="text-left rounded-xl px-3.5 py-3 transition-all"
                style={on ? { background: "rgba(255,203,5,0.1)", border: `1px solid ${MAIZE}` } : SUBTLE}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: on ? MAIZE : "white" }}>{l.title}</span>
                  {used && <span className="text-[10px]" style={{ color: MAIZE }}>✓</span>}
                </span>
              </button>
            );
          })}
        </div>
        {lens && (
          <div className="mt-3 rounded-xl p-4" style={{ background: "rgba(255,203,5,0.05)", border: "1px solid rgba(255,203,5,0.2)" }}>
            <p className="text-sm text-white/85 leading-relaxed">{lens.prompt}</p>
            <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); addIdea(lensDraft, lens.id); setLensDraft(""); }}>
              <TextInput value={lensDraft} onChange={setLensDraft} placeholder="An idea through this lens…" disabled={full} />
              <PrimaryButton type="submit" disabled={!lensDraft.trim() || full} className="flex-shrink-0">Add</PrimaryButton>
            </form>
          </div>
        )}
        <CoachPanel {...coachProps} actions={[{ mode: "stretch-provoke", label: "Push my thinking" }]} />
      </div>

      <div className={unlocked ? "" : "opacity-40 pointer-events-none select-none"} aria-disabled={!unlocked}>
        <SectionLabel>3 · Choose one</SectionLabel>
        <p className="text-xs text-white/45 mb-3 leading-relaxed">
          Score your favorites with the dots above: impact, how doable it is, and how excited you are. Then choose the one you&rsquo;ll take forward. The highest score doesn&rsquo;t have to win.
        </p>
        <Field label={chosen?.text ? `How would “${chosen.text}” work?` : "How would your chosen idea work?"} hint="Two or three sentences. What does the person you pictured actually experience?">
          <AutoTextarea value={data.stretch.solution} onChange={(v) => update((x) => { x.stretch.solution = v; })} placeholder="It works like this…" rows={3} disabled={!chosen} />
        </Field>
      </div>
    </div>
  );
}

function StressStep({ data, update, askCoach, coachProps }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const objections = data.stress.objections;
  const anyAnswered = objections.some((o) => o.answer.trim());
  const blocked = COACH_PREREQS["stress-objections"](data);
  const left = coachLeft(coachProps.usage);

  const bring = async (standard) => {
    setError("");
    let list = FALLBACK_OBJECTIONS;
    if (!standard) {
      setBusy(true);
      const { reply, error: err } = await askCoach("stress-objections");
      setBusy(false);
      if (!reply) { setError(err); return; }
      list = reply.bullets;
    }
    update((x) => { x.stress.objections = list.slice(0, OBJECTION_COUNT).map((o) => ({ label: o.label, text: o.text, answer: "" })); });
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl px-4 py-3 text-sm text-white/75 leading-relaxed" style={SUBTLE}>
        <span className="text-white/40">Your solution: </span>
        {data.stretch.solution}
      </div>

      <div>
        <SectionLabel>Face the skeptic</SectionLabel>
        {objections.length === 0 ? (
          <div className="rounded-xl p-5 text-center" style={SUBTLE}>
            <p className="text-sm text-white/70 leading-relaxed max-w-md mx-auto">
              The coach will play a tough investor and a doubtful customer, and raise the three hardest objections to your idea. Your job is to answer them.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <PrimaryButton onClick={() => bring(false)} disabled={busy || Boolean(blocked) || left === 0}>
                <SparkIcon className="w-3.5 h-3.5" />
                {busy ? "Sharpening objections…" : "Bring on the objections"}
              </PrimaryButton>
              <button type="button" onClick={() => bring(true)} className="text-xs text-white/45 hover:text-white/75">
                or use three standard objections
              </button>
            </div>
            {error && <p className="text-xs text-red-300 mt-3">{error}</p>}
          </div>
        ) : (
          <>
            <ol className="space-y-4">
              {objections.map((o, i) => (
                <li key={i} className="rounded-xl p-4" style={SUBTLE}>
                  <p className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: MAIZE }}>
                    Objection {i + 1}{o.label ? ` · ${o.label}` : ""}
                  </p>
                  <p className="text-sm text-white leading-relaxed mb-3">{o.text}</p>
                  <AutoTextarea value={o.answer} onChange={(v) => update((x) => { x.stress.objections[i].answer = v; })} placeholder="Your answer…" />
                </li>
              ))}
            </ol>
            {!anyAnswered && (
              <button type="button" onClick={() => update((x) => { x.stress.objections = []; })} className="mt-3 text-[11px] text-white/35 hover:text-white/60">
                Start over with different objections
              </button>
            )}
            <CoachPanel {...coachProps} actions={[{ mode: "stress-review", label: "How did I do?" }]} />
          </>
        )}
      </div>

      <div className="space-y-6">
        <Field label="What's your riskiest assumption?" hint="The one thing that, if it's wrong, sinks the whole idea. Usually it's about whether people will change what they do.">
          <AutoTextarea value={data.stress.assumption} onChange={(v) => update((x) => { x.stress.assumption = v; })} placeholder="I'm assuming that…" />
        </Field>
        <Field label="What's the cheapest way to test it this week?" hint="No building allowed. Think conversations, a sign-up sheet, a fake flyer, doing it by hand for three people.">
          <AutoTextarea value={data.stress.test} onChange={(v) => update((x) => { x.stress.test = v; })} placeholder="This week I could…" />
        </Field>
      </div>
    </div>
  );
}

function NotesDrawer({ data }) {
  const [open, setOpen] = useState(false);
  const chosen = data.stretch.ideas[data.stretch.chosen];
  const rows = [
    ["Problem", problemSentence(data)],
    ["Person", data.who.person],
    ["Today", data.who.today],
    ["Solution", [chosen?.text, data.stretch.solution].filter(Boolean).join(": ")],
    ["Riskiest assumption", data.stress.assumption],
  ];
  return (
    <div className="rounded-xl" style={SUBTLE}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/80">
        Your notes so far
        <span className="text-white/40 text-xs">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <dl className="px-4 pb-4 space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wider text-white/35">{k}</dt>
              <dd className="text-sm text-white/75 leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function PitchStep({ data, update, coachProps }) {
  const secs = pitchSeconds(data.pitch);
  const pct = Math.min(100, (secs / 75) * 100);
  const color = secs <= PITCH_SECONDS ? "#34D399" : secs <= PITCH_SECONDS + 10 ? MAIZE : "#F87171";
  return (
    <div className="space-y-6">
      <NotesDrawer data={data} />

      <div className="rounded-xl p-4" style={SUBTLE}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-white">Spoken length</p>
          <p className="text-sm tabular-nums" style={{ color }}>
            ~{secs}s <span className="text-white/35">/ {PITCH_SECONDS}s</span>
          </p>
        </div>
        <div className="relative h-2 rounded-full mt-2.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
          <div className="absolute inset-y-0 w-px" style={{ left: `${(PITCH_SECONDS / 75) * 100}%`, background: "rgba(255,255,255,0.5)" }} />
        </div>
        <p className="text-[11px] text-white/40 mt-2">Estimated at a relaxed speaking pace. Read it out loud to check.</p>
      </div>

      {PITCH_BEATS.map((b) => {
        const s = Math.round(wordCount(data.pitch[b.id]) / WORDS_PER_SECOND);
        return (
          <Field
            key={b.id}
            label={
              <span className="flex items-baseline justify-between gap-3">
                <span>{b.label} <span className="text-white/35 font-normal">· about {b.seconds}s</span></span>
                <span className="text-[11px] font-normal tabular-nums" style={{ color: s > b.seconds * 1.5 ? "#F87171" : "rgba(255,255,255,0.35)" }}>~{s}s</span>
              </span>
            }
            hint={b.prompt}
          >
            <AutoTextarea value={data.pitch[b.id]} onChange={(v) => update((x) => { x.pitch[b.id] = v; })} placeholder="Write it the way you'd say it…" />
          </Field>
        );
      })}

      <CoachPanel {...coachProps} actions={[{ mode: "pitch-coach", label: "Coach my pitch" }]} />
    </div>
  );
}

// ─── Summary ───────────────────────────────────────────────────────────

function ideaAsText(d) {
  const chosen = d.stretch.ideas[d.stretch.chosen];
  const lines = [
    `IDEA: ${chosen?.text || d.spark.idea}`,
    "",
    `PROBLEM: ${problemSentence(d)}`,
    `PERSON: ${d.who.person}`,
    `TODAY THEY: ${d.who.today}`,
    `SOLUTION: ${d.stretch.solution}`,
    `RISKIEST ASSUMPTION: ${d.stress.assumption}`,
    `TEST THIS WEEK: ${d.stress.test}`,
    "",
    "60-SECOND PITCH",
    ...PITCH_BEATS.map((b) => `${b.label} (~${b.seconds}s): ${d.pitch[b.id]}`),
  ];
  return lines.join("\n");
}

function Summary({ data, onEdit, onReset }) {
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const chosen = data.stretch.ideas[data.stretch.chosen];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ideaAsText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const Block = ({ label, children }) => (
    <div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">{label}</p>
      <p className="text-sm sm:text-[15px] text-white/85 leading-relaxed">{children}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl overflow-hidden" style={GLASS}>
        <div className="px-6 sm:px-8 py-6" style={{ background: "linear-gradient(135deg, rgba(255,203,5,0.16), rgba(255,203,5,0.03))", borderBottom: "1px solid rgba(255,203,5,0.2)" }}>
          <p className="text-[11px] uppercase tracking-[0.25em] font-semibold" style={{ color: MAIZE }}>Your idea card</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-2 tracking-tight">{chosen?.text || data.spark.idea}</h2>
          <p className="text-xs text-white/45 mt-2">Started from: {data.spark.idea}</p>
        </div>
        <div className="px-6 sm:px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Block label="The problem">{problemSentence(data)}</Block>
          <Block label="The person">{data.who.person}</Block>
          <Block label="The solution">{data.stretch.solution}</Block>
          <Block label="Riskiest assumption">
            {data.stress.assumption}
            <span className="block text-white/55 mt-1.5">Test this week: {data.stress.test}</span>
          </Block>
        </div>
        <div className="px-6 sm:px-8 pb-7">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3">Your 60 seconds</p>
          <ol className="space-y-3">
            {PITCH_BEATS.map((b) => (
              <li key={b.id} className="flex gap-3">
                <span className="text-[11px] font-semibold w-24 flex-shrink-0 pt-0.5" style={{ color: MAIZE }}>{b.label}</span>
                <span className="text-sm text-white/80 leading-relaxed">{data.pitch[b.id]}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rounded-2xl p-6 sm:p-7" style={GLASS}>
        <h3 className="text-lg font-semibold text-white">Now go record it</h3>
        <p className="text-sm text-white/65 mt-2 leading-relaxed">
          Pitches are best heard. Record yourself on video or audio and talk through these beats in your own words rather than reading them out. A couple of takes is normal.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <PrimaryButton onClick={copy}>{copied ? "Copied" : "Copy my idea card"}</PrimaryButton>
          <GhostButton onClick={onEdit}>Keep editing</GhostButton>
        </div>
        <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-white/60">This clears everything you wrote. Start over?</span>
              <button type="button" onClick={onReset} className="text-xs font-semibold text-red-300 hover:text-red-200">Yes, start a new idea</button>
              <button type="button" onClick={() => setConfirmReset(false)} className="text-xs text-white/45 hover:text-white/75">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="text-xs text-white/40 hover:text-white/70">Start a new idea</button>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Intro ─────────────────────────────────────────────────────────────

function Intro({ onStart }) {
  return (
    <section className="rounded-2xl p-6 sm:p-8" style={GLASS}>
      <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">How it works</h2>
      <p className="text-sm sm:text-base text-white/70 mt-2 leading-relaxed">
        Seven short steps take you from a rough idea to a real problem, a solution you&rsquo;ve tested in your head, and a one-minute pitch you can record. Your work saves as you go, so you can come back anytime.
      </p>
      <ol className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex gap-3 rounded-xl p-3.5" style={SUBTLE}>
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: "rgba(255,203,5,0.15)", color: MAIZE }}>{i + 1}</span>
            <span>
              <span className="block text-sm font-semibold text-white">{s.label}: {s.title}</span>
              <span className="block text-xs text-white/50 mt-0.5 leading-relaxed">{s.blurb}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-xl p-4 flex gap-3" style={{ background: "rgba(255,203,5,0.05)", border: "1px solid rgba(255,203,5,0.2)" }}>
        <span style={{ color: MAIZE }} className="mt-0.5"><SparkIcon /></span>
        <p className="text-sm text-white/75 leading-relaxed">
          Along the way, a coach powered by UMGPT asks questions, finds gaps, and argues with you. You always write first, and it never writes your idea for you. You can ask the coach for help {DAILY_COACH_LIMIT} times a day.
        </p>
      </div>
      <PrimaryButton onClick={onStart} className="mt-6">Start building →</PrimaryButton>
    </section>
  );
}

// ─── Workspace ─────────────────────────────────────────────────────────

const STEP_VIEWS = {
  spark: SparkStep,
  dig: DigStep,
  who: WhoStep,
  check: CheckStep,
  stretch: StretchStep,
  stress: StressStep,
  pitch: PitchStep,
};

function IdeateWorkspace() {
  const [data, setData] = useState(null);
  const [step, setStep] = useState(0);
  const [view, setView] = useState("loading"); // loading | intro | steps | summary | error
  const [loadError, setLoadError] = useState("");
  const [usage, setUsage] = useState(null);
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const [coachBusy, setCoachBusy] = useState(null);
  const [coachErrors, setCoachErrors] = useState({});
  const dirty = useRef(false);
  const saveChain = useRef(Promise.resolve());
  const latest = useRef({ data: null, step: 0, completed: false });
  const topRef = useRef(null);
  const stepperRef = useRef(null);

  const allDone = useMemo(() => Boolean(data) && STEPS.every((s) => stepReady(s.id, data).ok), [data]);
  const furthest = useMemo(() => (data ? furthestUnlocked(data) : 0), [data]);
  latest.current = { data, step, completed: allDone };

  // Keep the active step pill visible on narrow screens.
  useEffect(() => {
    const el = stepperRef.current?.querySelector('[aria-current="step"]');
    const nav = stepperRef.current;
    if (!el || !nav) return;
    const left = el.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [step, view]);

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/ideate/session");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not load your saved work.");
        if (cancelled) return;
        setUsage(json.usage || null);
        if (json.session) {
          const d = json.session.data;
          setData(d);
          setStep(Math.min(json.session.currentStep, furthestUnlocked(d)));
          const done = STEPS.every((s) => stepReady(s.id, d).ok);
          setView(json.session.completedAt && done ? "summary" : "steps");
          setSaveState("saved");
        } else {
          setData(emptyIdeateData());
          setView("intro");
        }
      } catch (err) {
        if (!cancelled) { setLoadError(err.message); setView("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save — serialised, so an older snapshot can never land after a newer one.
  const saveNow = useCallback(() => {
    const snapshot = JSON.stringify({
      data: latest.current.data,
      currentStep: latest.current.step,
      completed: latest.current.completed,
    });
    dirty.current = false;
    setSaveState("saving");
    saveChain.current = saveChain.current.then(async () => {
      try {
        const res = await authedFetch("/api/ideate/session", { method: "PUT", body: snapshot });
        if (!res.ok) throw new Error("save failed");
        if (!dirty.current) setSaveState("saved");
      } catch {
        dirty.current = true;
        setSaveState("error");
      }
    });
  }, []);

  useEffect(() => {
    if (!data || !dirty.current) return undefined;
    setSaveState("pending");
    const t = setTimeout(saveNow, 900);
    return () => clearTimeout(t);
  }, [data, step, allDone, saveNow]);

  // Last-chance save when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== "hidden" || !dirty.current || !latest.current.data || !latestToken) return;
      dirty.current = false;
      fetch("/api/ideate/session", {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${latestToken}` },
        body: JSON.stringify({ data: latest.current.data, currentStep: latest.current.step, completed: latest.current.completed }),
      }).catch(() => { dirty.current = true; });
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  const update = useCallback((mutate) => {
    dirty.current = true;
    setData((prev) => {
      const next = clone(prev);
      mutate(next);
      return next;
    });
  }, []);

  const scrollToTop = () => {
    const el = topRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 96;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: "smooth" });
  };

  const goTo = (i) => {
    if (i < 0 || i > furthest) return;
    dirty.current = true;
    setStep(i);
    setView("steps");
    scrollToTop();
  };

  // Ask the coach. Returns { reply, error } and never throws.
  const askCoach = useCallback(async (mode) => {
    setCoachBusy(mode);
    try {
      const res = await authedFetch("/api/ideate/coach", {
        method: "POST",
        body: JSON.stringify({ mode, data: latest.current.data }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.usage) setUsage(json.usage);
      if (!res.ok) return { reply: null, error: json.error || "The coach couldn't answer just now." };
      return { reply: json.reply, error: "" };
    } catch {
      return { reply: null, error: "The coach couldn't answer just now." };
    } finally {
      setCoachBusy(null);
    }
  }, []);

  const askAndRecord = useCallback(async (mode, stepId) => {
    setCoachErrors((e) => ({ ...e, [stepId]: "" }));
    const { reply, error } = await askCoach(mode);
    if (!reply) {
      setCoachErrors((e) => ({ ...e, [stepId]: error }));
      return;
    }
    update((x) => { x.coach[stepId] = [...(x.coach[stepId] || []), reply].slice(-COACH_HISTORY); });
  }, [askCoach, update]);

  const reset = async () => {
    try {
      const res = await authedFetch("/api/ideate/session", { method: "DELETE" });
      if (!res.ok) throw new Error();
      dirty.current = false;
      setData(emptyIdeateData());
      setStep(0);
      setSaveState("idle");
      setView("intro");
      scrollToTop();
    } catch {
      setSaveState("error");
    }
  };

  const saveLabel = {
    idle: "",
    pending: "Saving…",
    saving: "Saving…",
    saved: "Saved",
    error: "",
  }[saveState];

  const current = STEPS[step];
  const StepView = STEP_VIEWS[current.id];
  const ownReady = data ? stepReady(current.id, data) : { ok: false };
  // An earlier step can fall back to incomplete if the student edits it later.
  const ready = ownReady.ok && step + 1 > furthest && step < STEPS.length - 1
    ? { ok: false, hint: `Finish ${STEPS[furthest].label} first.` }
    : ownReady;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="relative min-h-[calc(100vh-5rem)]">
      <PageBackground src={rulesBg} priority quality={72} fixed />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0, background: "linear-gradient(to bottom, rgba(11,26,59,0.7) 0%, rgba(11,26,59,0.85) 50%, rgba(11,26,59,0.94) 100%)" }}
      />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
        <header className="mb-8 sm:mb-10">
          <p className="text-xs sm:text-sm uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: MAIZE }}>
            10,000 Pitches · Ideate
          </p>
          <h1 className="font-bold text-white tracking-tight leading-[1.05]" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)" }}>
            Build an idea <span style={{ color: MAIZE }}>worth pitching</span>
          </h1>
          <p className="mt-4 text-white/70 text-base sm:text-lg max-w-2xl leading-relaxed">
            Great pitches start with a real problem. Work through it step by step. You do the thinking, and the coach helps you push further.
          </p>
        </header>

        <div ref={topRef} />

        {view === "loading" && (
          <div className="rounded-2xl p-8 text-center text-sm text-white/50" style={GLASS}>Loading your workspace…</div>
        )}

        {view === "error" && (
          <div className="rounded-2xl p-8 text-center" style={GLASS}>
            <p className="text-sm text-red-300">{loadError}</p>
            <GhostButton className="mt-4" onClick={() => window.location.reload()}>Try again</GhostButton>
          </div>
        )}

        {view === "intro" && data && <Intro onStart={() => { setView("steps"); scrollToTop(); }} />}

        {view === "summary" && data && (
          <Summary data={data} onEdit={() => goTo(STEPS.length - 1)} onReset={reset} />
        )}

        {view === "steps" && data && (
          <>
            {/* Stepper */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <nav ref={stepperRef} className="relative flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-1" aria-label="Steps">
                {STEPS.map((s, i) => {
                  const unlocked = i <= furthest;
                  const done = stepReady(s.id, data).ok;
                  const active = i === step;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => goTo(i)}
                      aria-current={active ? "step" : undefined}
                      className="flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed"
                      style={
                        active
                          ? { background: MAIZE, color: NAVY }
                          : { background: "rgba(11,26,59,0.6)", color: unlocked ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.1)" }
                      }
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                        style={active ? { background: NAVY, color: MAIZE } : { background: done ? "rgba(255,203,5,0.2)" : "rgba(255,255,255,0.08)", color: done ? MAIZE : "inherit" }}
                      >
                        {done && !active ? "✓" : i + 1}
                      </span>
                      {s.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            <section className="rounded-2xl p-5 sm:p-8" style={GLASS}>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-semibold">
                    Step {step + 1} of {STEPS.length}
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">{current.title}</h2>
                  <p className="text-sm sm:text-base text-white/65 mt-2 leading-relaxed">{current.blurb}</p>
                </div>
                <div className="flex-shrink-0 text-right pt-1 min-w-[64px]">
                  {saveState === "error" ? (
                    <button type="button" onClick={saveNow} className="text-[11px] text-red-300 hover:text-red-200">Not saved · Retry</button>
                  ) : (
                    <span className="text-[11px] text-white/35">{saveLabel}</span>
                  )}
                </div>
              </div>

              <StepView
                data={data}
                update={update}
                goTo={goTo}
                askCoach={askCoach}
                coachProps={{
                  data,
                  usage,
                  busyMode: coachBusy,
                  error: coachErrors[current.id],
                  replies: data.coach[current.id] || [],
                  onAsk: (mode) => askAndRecord(mode, current.id),
                }}
              />

              <div className="mt-10 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                {!ready.ok && ready.hint && <p className="text-xs text-white/45 mb-3 sm:hidden text-right">{ready.hint}</p>}
                <div className="flex items-center justify-between gap-3">
                  <GhostButton onClick={() => goTo(step - 1)} disabled={step === 0}>← Back</GhostButton>
                  <div className="flex items-center gap-3">
                    {!ready.ok && ready.hint && <span className="hidden sm:inline text-xs text-white/45">{ready.hint}</span>}
                    {isLast ? (
                      <PrimaryButton
                        disabled={!allDone}
                        onClick={() => { dirty.current = true; setView("summary"); saveNow(); scrollToTop(); }}
                      >
                        See my idea card
                      </PrimaryButton>
                    ) : (
                      <PrimaryButton disabled={!ready.ok} onClick={() => goTo(step + 1)}>Next →</PrimaryButton>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default function IdeatePage() {
  return (
    <ProtectedRoute returnTo="/ideate">
      <IdeateWorkspace />
    </ProtectedRoute>
  );
}
