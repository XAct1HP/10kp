"use client";

import { useState } from "react";
import { Icon } from "./art";
import CoachPanel, { coachLeft } from "./Coach";
import {
  MAIZE,
  NAVY,
  STAGE_THEME,
  DOOR_ICONS,
  LENS_ICONS,
  NOTE_TINTS,
  NOTE_TILTS,
  BEAT_COLORS,
  RATING_COLORS,
} from "./theme";
import {
  AutoTextarea,
  TextInput,
  Field,
  Eyebrow,
  IconBadge,
  PrimaryButton,
  AccentButton,
  GhostButton,
  ProgressRing,
  Avatar,
  personaName,
  SUBTLE,
  accent,
  tint,
} from "./ui";
import {
  DOORS,
  LENSES,
  CHECK_RATINGS,
  PITCH_BEATS,
  FALLBACK_WHY,
  FALLBACK_OBJECTIONS,
  COACH_PREREQS,
  MAX_RUNGS,
  MIN_IDEAS,
  MAX_IDEAS,
  OBJECTION_COUNT,
  PITCH_SECONDS,
  SHORT_TEXT,
  WORDS_PER_SECOND,
  answeredRungs,
  namedIdeas,
  wordCount,
  pitchSeconds,
  problemSentence,
} from "../../lib/ideate/curriculum";

const filled = (s) => typeof s === "string" && s.trim().length > 0;

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// A reminder of what the student is building on, carried into later stages.
function Carry({ icon, rgb, label, children }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={SUBTLE}>
      <IconBadge name={icon} rgb={rgb} size="w-8 h-8" iconSize="w-4 h-4" />
      <p className="text-sm leading-relaxed min-w-0 pt-1">
        <span className="text-white/40">{label} </span>
        <span className="text-white/85 font-medium">{children}</span>
      </p>
    </div>
  );
}

// ─── 1 · Spark ─────────────────────────────────────────────────────────

function Bulb({ glow }) {
  return (
    <div className="relative flex-shrink-0 w-16 h-20 sm:w-24 sm:h-28" aria-hidden="true">
      <div
        className="absolute inset-0 rounded-full transition-all duration-700"
        style={{ background: `radial-gradient(circle, ${accent(0.6 * glow)}, transparent 65%)`, transform: `scale(${1 + glow * 0.8})` }}
      />
      <svg viewBox="0 0 64 80" className="relative w-full h-full">
        <path
          d="M32 6a22 22 0 00-13 39.8c2.3 1.8 3.5 4.3 3.5 7.2V58h19v-5c0-2.9 1.2-5.4 3.5-7.2A22 22 0 0032 6z"
          fill={`rgba(var(--accent-rgb), ${0.06 + 0.9 * glow})`}
          stroke="var(--accent)"
          strokeWidth="2.5"
          style={{ transition: "fill 500ms ease" }}
        />
        <path d="M25 40l7-9 7 9" stroke={glow >= 1 ? NAVY : "rgba(255,255,255,0.5)"} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 65h16M27 72h10" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function SparkStage({ data, update }) {
  const words = wordCount(data.spark.idea);
  const glow = Math.min(1, words / 3);
  const door = DOORS.find((d) => d.id === data.spark.door);

  return (
    <div className="space-y-10">
      <div>
        <Eyebrow>Pick a door</Eyebrow>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {DOORS.map((d, i) => {
            const on = data.spark.door === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => update((x) => { x.spark.door = d.id; })}
                className="ideate-rise group relative text-left sm:text-center overflow-hidden rounded-2xl sm:rounded-b-2xl sm:rounded-t-[999px] p-4 sm:px-5 sm:pt-14 sm:pb-6 flex sm:flex-col items-center gap-4 sm:gap-4 transition-all duration-300 hover:-translate-y-1"
                style={{
                  animationDelay: `${i * 80}ms`,
                  background: on
                    ? `linear-gradient(180deg, ${accent(0.24)}, ${accent(0.04)})`
                    : "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015))",
                  border: `1px solid ${on ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
                  boxShadow: on ? `0 18px 50px ${accent(0.25)}` : "none",
                }}
              >
                <span
                  className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${on ? "ideate-float" : ""}`}
                  style={{ background: on ? "var(--accent)" : accent(0.12), color: on ? NAVY : "var(--accent)" }}
                >
                  <Icon name={DOOR_ICONS[d.id]} className="w-6 h-6 sm:w-7 sm:h-7" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] sm:text-base font-bold text-white">{d.title}</span>
                  <span className="block text-xs text-white/50 mt-1 leading-relaxed">{d.prompt}</span>
                </span>
                {on && (
                  <span className="ideate-pop absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--accent)", color: NAVY }}>
                    <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="relative rounded-3xl p-5 sm:p-8 overflow-hidden transition-all duration-500"
        style={{
          background: `radial-gradient(ellipse at 88% 50%, ${accent(0.16 * glow)}, transparent 55%), rgba(255,255,255,0.03)`,
          border: `1px solid ${glow >= 1 ? accent(0.4) : "rgba(255,255,255,0.08)"}`,
        }}
      >
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex-1 min-w-0">
            <label htmlFor="ideate-spark" className="block text-[11px] uppercase tracking-[0.22em] font-bold mb-2" style={{ color: "var(--accent)" }}>
              Your idea in one sentence
            </label>
            {door && <p className="text-xs text-white/40 mb-3">{door.title}…</p>}
            <AutoTextarea
              bare
              id="ideate-spark"
              rows={1}
              maxLength={SHORT_TEXT}
              value={data.spark.idea}
              onChange={(v) => update((x) => { x.spark.idea = v.replace(/\n/g, " "); })}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="e.g. A better way to find study space"
              className="ideate-line text-xl sm:text-3xl font-bold text-white leading-snug pb-3"
            />
            <p className="text-xs mt-3 transition-colors" style={{ color: glow >= 1 ? "var(--accent)" : "rgba(255,255,255,0.45)" }}>
              {glow >= 1 ? "That's a spark. Next you'll dig underneath it." : "Rough is fine. “A better toothbrush” is a perfectly good start."}
            </p>
          </div>
          <Bulb glow={glow} />
        </div>
      </div>
    </div>
  );
}

// ─── 2 · Dig ───────────────────────────────────────────────────────────

const DEPTH_LABELS = ["At the surface", "One level down", "Deeper", "Deeper still", "Bedrock"];

function DepthMeter({ value }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-1">
        {Array.from({ length: MAX_RUNGS }, (_, i) => (
          <span key={i} className="w-2 h-4 rounded-sm transition-all duration-500" style={{ background: i < value ? `rgba(var(--accent-rgb), ${0.45 + i * 0.13})` : "rgba(255,255,255,0.1)" }} />
        ))}
      </span>
      <span className="text-[11px] text-white/45 tabular-nums">{value}/{MAX_RUNGS}</span>
    </span>
  );
}

function LineInput({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/40">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={SHORT_TEXT}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ideate-line w-full text-base sm:text-xl font-semibold text-white placeholder-white/20 py-2"
      />
    </label>
  );
}

function Connector({ children }) {
  return (
    <p className="flex items-center gap-3 text-sm sm:text-base italic text-white/50">
      <span className="h-px w-6" style={{ background: accent(0.5) }} />
      {children}
    </p>
  );
}

export function DigStage({ data, update, askCoach, coachProps }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const rungs = data.dig.rungs;
  const last = rungs[rungs.length - 1];
  const canDig = rungs.length < MAX_RUNGS && last && filled(last.answer);
  const statementDone = filled(data.dig.who) && filled(data.dig.what) && filled(data.dig.why);

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
    <div className="space-y-10">
      <Carry icon="bulb" rgb={STAGE_THEME.spark.rgb} label="Your spark:">{data.spark.idea}</Carry>

      <div>
        <Eyebrow right={<DepthMeter value={answeredRungs(data)} />}>The why ladder</Eyebrow>
        <ol>
          {rungs.map((r, i) => {
            const isLast = i === rungs.length - 1;
            const layer = 0.05 + i * 0.045;
            return (
              <li key={i} className="ideate-rise grid grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[52px_minmax(0,1fr)] gap-3 sm:gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`relative z-10 w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-sm font-black ${isLast ? "ideate-pulse" : ""}`}
                    style={isLast ? { background: "var(--accent)", color: NAVY } : { background: accent(0.18), color: "var(--accent)" }}
                  >
                    {i + 1}
                  </span>
                  {!isLast && (
                    <span className="flex-1 w-[2px] my-1" style={{ background: `repeating-linear-gradient(to bottom, ${accent(0.55)} 0 6px, transparent 6px 12px)` }} />
                  )}
                </div>
                <div
                  className="rounded-2xl p-4 sm:p-5 mb-3"
                  style={{
                    background: `linear-gradient(135deg, rgba(var(--accent-rgb), ${layer}), rgba(var(--second-rgb), ${layer * 0.7}))`,
                    border: `1px solid ${accent(0.12 + i * 0.06)}`,
                  }}
                >
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/40">{DEPTH_LABELS[i]}</p>
                  <p className="text-[15px] sm:text-lg font-bold text-white mt-1 mb-3 leading-snug">{r.question}</p>
                  <AutoTextarea
                    value={r.answer}
                    onChange={(v) => update((x) => { x.dig.rungs[i].answer = v; })}
                    placeholder="Answer honestly. Specifics beat big words."
                    style={{ background: "rgba(11,26,59,0.45)" }}
                  />
                  {isLast && i > 0 && !filled(r.answer) && (
                    <button type="button" onClick={() => { update((x) => { x.dig.rungs.pop(); }); setNote(""); }} className="mt-2 text-[11px] text-white/35 hover:text-white/70">
                      Remove this question
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="pl-[48px] sm:pl-[68px]">
          {note && <p className="ideate-fade text-sm text-white/65 mb-3 leading-relaxed">{note}</p>}
          {rungs.length < MAX_RUNGS ? (
            <div className="flex flex-wrap items-center gap-3">
              <AccentButton onClick={digDeeper} disabled={!canDig || busy}>
                <Icon name="arrowDown" className={`w-4 h-4 ${canDig && !busy ? "ideate-bob" : ""}`} strokeWidth={2.4} />
                {busy ? "Finding the next question…" : "Dig deeper"}
              </AccentButton>
              {!canDig && <span className="text-[11px] text-white/35">Answer the question above first.</span>}
            </div>
          ) : (
            <span className="ideate-pop inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold" style={{ background: accent(0.16), color: "var(--accent)" }}>
              <Icon name="gem" className="w-4 h-4" /> You hit bedrock. Write down what you found.
            </span>
          )}
        </div>
      </div>

      <div
        className="relative rounded-3xl p-5 sm:p-8 overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${accent(0.16)}, rgba(255,255,255,0.02) 55%)`, border: `1px solid ${accent(0.3)}` }}
      >
        <div className="pointer-events-none absolute -bottom-20 -right-10 w-64 h-64 rounded-full" style={{ background: `radial-gradient(circle, rgba(var(--second-rgb), 0.18), transparent 70%)` }} />
        <div className="relative flex items-center gap-3 mb-2">
          <IconBadge name="gem" size="w-11 h-11" iconSize="w-5 h-5" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/45">What you found down there</p>
            <h3 className="text-lg sm:text-2xl font-black text-white tracking-tight">The root problem</h3>
          </div>
        </div>
        <p className="relative text-xs sm:text-sm text-white/50 mb-6 leading-relaxed max-w-2xl">
          Write down the deepest real problem you reached. Describe the problem, not your solution. &ldquo;There&rsquo;s no app for it&rdquo; is a solution in disguise.
        </p>
        <div className="relative space-y-3">
          <LineInput label="Who" value={data.dig.who} onChange={(v) => update((x) => { x.dig.who = v; })} placeholder="Who: e.g. commuter students with back-to-back classes" />
          <Connector>struggles with</Connector>
          <LineInput label="What" value={data.dig.what} onChange={(v) => update((x) => { x.dig.what = v; })} placeholder="What: the specific struggle" />
          <Connector>because</Connector>
          <LineInput label="Why" value={data.dig.why} onChange={(v) => update((x) => { x.dig.why = v; })} placeholder="Why: the root cause you dug up" />
        </div>
        {statementDone && (
          <blockquote className="ideate-pop ideate-sheen relative mt-7 rounded-2xl p-4 sm:p-5 text-base sm:text-xl font-bold text-white leading-snug" style={{ background: "rgba(11,26,59,0.6)", border: `1px solid ${accent(0.35)}` }}>
            <Icon name="quote" className="w-6 h-6 mb-2" style={{ color: "var(--accent)" }} />
            {problemSentence(data)}
          </blockquote>
        )}
      </div>

      <CoachPanel {...coachProps} className="" actions={[{ mode: "dig-problem", label: "Pressure-test my statement" }]} />
    </div>
  );
}

// ─── 3 · Who ───────────────────────────────────────────────────────────

const WHO_FIELDS = [
  { key: "person", icon: "person", label: "Who is one specific person with this problem?", hint: "Give them a name, an age, a situation. Not “students.” More like: a first-year commuting from Ypsi who works nights.", placeholder: "Describe them…" },
  { key: "lastTime", icon: "clock", label: "When did it last happen to them?", hint: "Walk through the moment: where they were, what went wrong, how it felt.", placeholder: "Last Tuesday, they…" },
  { key: "today", icon: "wrench", label: "What do they do about it today?", hint: "A clumsy workaround is a good sign: it means the pain is real. If they do nothing, ask yourself whether it really hurts.", placeholder: "Right now they…" },
];

function PersonaCard({ who }) {
  const name = personaName(who.person);
  const rest = who.person.trim().slice(name.length).replace(/^[\s,.;:–-]+/, "");
  const complete = WHO_FIELDS.filter((f) => filled(who[f.key])).length;
  return (
    <div className="rounded-3xl overflow-hidden" style={{ border: `1px solid ${accent(0.35)}`, background: "rgba(11,26,59,0.75)", boxShadow: `0 24px 60px ${accent(0.15)}` }}>
      <div className="relative h-24" style={{ background: "linear-gradient(135deg, var(--accent), rgb(var(--second-rgb)))" }}>
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)", backgroundSize: "12px 12px" }} />
        <span className="absolute top-3 left-4 text-[10px] uppercase tracking-[0.3em] font-black" style={{ color: "rgba(11,26,59,0.7)" }}>Persona</span>
        <span className="absolute top-3 right-4 flex gap-1">
          {WHO_FIELDS.map((f, i) => (
            <span key={f.key} className="w-2 h-2 rounded-full" style={{ background: i < complete ? NAVY : "rgba(11,26,59,0.25)" }} />
          ))}
        </span>
      </div>
      <div className="px-5 pb-5 -mt-9">
        <div className="rounded-full p-1 inline-block" style={{ background: "rgba(11,26,59,1)" }}>
          <Avatar text={who.person} size={64} rgb={STAGE_THEME.who.rgb} />
        </div>
        <p className="mt-2 text-lg font-black text-white leading-tight">{name || <span className="text-white/30">Your person</span>}</p>
        {rest && <p className="text-xs text-white/55 mt-1 leading-relaxed line-clamp-3">{rest}</p>}
        <div className="mt-4 space-y-3">
          {[
            { key: "lastTime", icon: "clock", title: "The moment" },
            { key: "today", icon: "wrench", title: "Today's workaround" },
          ].map((row) => (
            <div key={row.key} className="rounded-xl p-3" style={SUBTLE}>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: "var(--accent)" }}>
                <Icon name={row.icon} className="w-3.5 h-3.5" /> {row.title}
              </p>
              <p className={`text-[13px] mt-1 leading-relaxed line-clamp-4 ${filled(who[row.key]) ? "text-white/80" : "text-white/25 italic"}`}>
                {filled(who[row.key]) ? who[row.key] : "Not written yet"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WhoStage({ data, update, coachProps }) {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_300px] gap-8">
        <ol className="relative space-y-8">
          <span className="absolute left-[15px] top-8 bottom-6 w-[2px]" style={{ background: `linear-gradient(${accent(0.6)}, ${accent(0.05)})` }} />
          {WHO_FIELDS.map((f, i) => (
            <li key={f.key} className="ideate-rise relative pl-12" style={{ animationDelay: `${i * 90}ms` }}>
              <span
                className="absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center"
                style={filled(data.who[f.key]) ? { background: "var(--accent)", color: NAVY } : { background: "rgba(11,26,59,1)", color: "var(--accent)", border: `2px solid ${accent(0.5)}` }}
              >
                <Icon name={f.icon} className="w-4 h-4" strokeWidth={2.2} />
              </span>
              <label className="block text-[15px] sm:text-base font-bold text-white leading-snug">{f.label}</label>
              <p className="text-xs text-white/45 leading-relaxed mt-1 mb-3">{f.hint}</p>
              <AutoTextarea value={data.who[f.key]} onChange={(v) => update((x) => { x.who[f.key] = v; })} placeholder={f.placeholder} />
            </li>
          ))}
        </ol>
        <div className="md:sticky md:top-[120px] self-start">
          <PersonaCard who={data.who} />
        </div>
      </div>
      <CoachPanel {...coachProps} className="" actions={[{ mode: "who-sharpen", label: "Is this specific enough?" }]} />
    </div>
  );
}

// ─── 4 · Check ─────────────────────────────────────────────────────────

const CHECK_FIELDS = [
  { key: "existing", icon: "layers", label: "What do people use today?", hint: "List everything you know of: products, apps, services, workarounds. “Nothing, they just put up with it” is an answer too.", placeholder: "Today people…" },
  { key: "scale", icon: "users", label: "How many people have this, and how often?", hint: "A rough guess is fine. How could you find out for real?", placeholder: "My guess is…" },
  { key: "payer", icon: "wallet", label: "Who would pay for a fix?", hint: "Not always the person with the problem: parents, a school, an employer, an insurer, advertisers…", placeholder: "The one paying would be…" },
];

export function CheckStage({ data, update, coachProps, goTo }) {
  const talked = data.check.talkedTo;
  const rating = data.check.rating;

  return (
    <div className="space-y-10">
      <div>
        <Eyebrow>Gather the evidence</Eyebrow>
        <div className="grid gap-4">
          {CHECK_FIELDS.map((f, i) => (
            <div
              key={f.key}
              className="ideate-rise rounded-2xl p-4 sm:p-5"
              style={{ ...SUBTLE, borderLeft: `3px solid ${filled(data.check[f.key]) ? "var(--accent)" : "rgba(255,255,255,0.12)"}`, animationDelay: `${i * 80}ms` }}
            >
              <Field icon={f.icon} label={f.label} hint={f.hint}>
                <AutoTextarea value={data.check[f.key]} onChange={(v) => update((x) => { x.check[f.key] = v; })} placeholder={f.placeholder} />
              </Field>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: `linear-gradient(90deg, ${accent(0.1)}, rgba(255,255,255,0.02))`, border: `1px solid ${accent(0.2)}` }}>
        <div className="flex items-center">
          {[0, 1, 2].map((i) => {
            const on = i < talked;
            return (
              <span
                key={i}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 -ml-2 first:ml-0"
                style={on
                  ? { background: "var(--accent)", color: NAVY, border: "3px solid #0f2147", transform: "translateY(-3px)", boxShadow: `0 8px 20px ${accent(0.35)}` }
                  : { background: "#16264a", color: "rgba(255,255,255,0.25)", border: "3px solid #0f2147" }}
              >
                <Icon name="person" className="w-5 h-5" strokeWidth={2.2} />
              </span>
            );
          })}
          {talked > 3 && <span className="ml-2 text-sm font-black" style={{ color: "var(--accent)" }}>+{talked - 3}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-white">Real people I&rsquo;ve asked about this</p>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
            {talked >= 3 ? "Nice. Real conversations beat any guess." : "Ask three people before you choose a solution. It's the fastest reality check there is."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" aria-label="Fewer" onClick={() => update((x) => { x.check.talkedTo = Math.max(0, x.check.talkedTo - 1); })} className="w-9 h-9 rounded-xl text-lg text-white/70 hover:text-white ideate-input">−</button>
          <span className="w-8 text-center text-2xl font-black tabular-nums" style={{ color: talked >= 3 ? "var(--accent)" : "white" }}>{talked}</span>
          <button type="button" aria-label="More" onClick={() => update((x) => { x.check.talkedTo = Math.min(99, x.check.talkedTo + 1); })} className="w-9 h-9 rounded-xl text-lg text-white/70 hover:text-white ideate-input">+</button>
        </div>
      </div>

      <CoachPanel {...coachProps} className="" actions={[{ mode: "check-research", label: "Find what I missed" }]} />

      <div>
        <Eyebrow>Your honest verdict</Eyebrow>
        <div className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[88px_minmax(0,1fr)] gap-4 sm:gap-6">
          <div
            className="rounded-[26px] sm:rounded-[32px] p-2.5 sm:p-3 flex flex-col justify-around gap-3"
            style={{ background: "linear-gradient(180deg, #1b2335, #0b1120)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "inset 0 3px 10px rgba(0,0,0,0.6), 0 20px 40px rgba(0,0,0,0.35)" }}
          >
            {CHECK_RATINGS.map((r) => {
              const on = rating === r.id;
              const rgb = RATING_COLORS[r.id];
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => update((x) => { x.check.rating = r.id; })}
                  className="aspect-square w-full rounded-full transition-all duration-300"
                  style={{
                    background: on ? `radial-gradient(circle at 35% 30%, #ffffff, rgb(${rgb}) 42%, rgba(${rgb}, 0.85))` : `radial-gradient(circle at 35% 30%, rgba(${rgb}, 0.25), rgba(${rgb}, 0.08))`,
                    boxShadow: on ? `0 0 22px rgba(${rgb}, 0.9), 0 0 60px rgba(${rgb}, 0.5)` : "inset 0 3px 8px rgba(0,0,0,0.6)",
                  }}
                />
              );
            })}
          </div>
          <div className="flex flex-col justify-around gap-3">
            {CHECK_RATINGS.map((r) => {
              const on = rating === r.id;
              const rgb = RATING_COLORS[r.id];
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update((x) => { x.check.rating = r.id; })}
                  className="text-left rounded-2xl p-3.5 sm:p-4 transition-all duration-300 hover:-translate-y-0.5"
                  style={on ? { background: tint(rgb, 0.12), border: `1px solid ${tint(rgb, 0.65)}`, boxShadow: `0 10px 30px ${tint(rgb, 0.18)}` } : SUBTLE}
                >
                  <span className="block text-[15px] font-bold" style={{ color: on ? `rgb(${rgb})` : "white" }}>{r.label}</span>
                  <span className="block text-xs text-white/55 mt-1 leading-relaxed">{r.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
        {rating === "red" && (
          <div className="ideate-pop mt-4">
            <GhostButton onClick={() => goTo(1)}>
              <Icon name="arrowLeft" className="w-4 h-4" /> Back to Dig
            </GhostButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 5 · Stretch ───────────────────────────────────────────────────────

function ScoreRow({ icon, label, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
      <span className="text-[10px] uppercase tracking-wider text-white/45 w-12">{label}</span>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n}`}
            onClick={() => onChange(value === n ? 0 : n)}
            className="w-3.5 h-3.5 rounded-full transition-all hover:scale-125"
            style={{ background: n <= value ? MAIZE : "rgba(255,255,255,0.14)" }}
          />
        ))}
      </span>
    </div>
  );
}

export function StretchStage({ data, update, coachProps }) {
  const [draft, setDraft] = useState("");
  const [lensId, setLensId] = useState("");
  const [lensDraft, setLensDraft] = useState("");
  const ideas = data.stretch.ideas;
  const count = namedIdeas(data).length;
  const unlocked = count >= MIN_IDEAS;
  const lens = LENSES.find((l) => l.id === lensId);
  const full = ideas.length >= MAX_IDEAS;
  const chosen = ideas[data.stretch.chosen];

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

  return (
    <div className="space-y-10">
      <Carry icon="gem" rgb={STAGE_THEME.dig.rgb} label="Solving:">{problemSentence(data)}</Carry>

      {/* Idea wall */}
      <div>
        <div className="flex items-center gap-4 mb-4">
          <ProgressRing value={count / MIN_IDEAS} size={52} stroke={5}>
            <span className="text-sm font-black text-white tabular-nums">{count}</span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: "var(--accent)" }}>1 · The idea wall</p>
            <p className="text-sm text-white/60 leading-snug mt-0.5">
              {unlocked ? "Wall unlocked. Keep going, or draw a lens for a new angle." : `Quantity first. Silly ideas count. ${MIN_IDEAS - count} more to unlock lenses.`}
            </p>
          </div>
        </div>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addIdea(draft); setDraft(""); }}>
          <TextInput value={draft} onChange={setDraft} placeholder={full ? "That's plenty of ideas" : "Another way to solve it…"} disabled={full} />
          <PrimaryButton type="submit" disabled={!draft.trim() || full} className="flex-shrink-0">
            <Icon name="plus" className="w-4 h-4" strokeWidth={2.6} /> Add
          </PrimaryButton>
        </form>

        {ideas.length > 0 ? (
          <ul className="mt-6 grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {ideas.map((idea, i) => {
              const picked = data.stretch.chosen === i;
              const rgb = NOTE_TINTS[i % NOTE_TINTS.length];
              const total = idea.impact + idea.doable + idea.excite;
              const lensName = LENSES.find((l) => l.id === idea.lens)?.title;
              return (
                <li
                  key={i}
                  className="ideate-note ideate-pop relative rounded-2xl p-4 pt-5 flex flex-col"
                  style={{
                    "--tilt": NOTE_TILTS[i % NOTE_TILTS.length],
                    background: `linear-gradient(160deg, ${tint(rgb, 0.22)}, ${tint(rgb, 0.07)})`,
                    border: picked ? `2px solid ${MAIZE}` : `1px solid ${tint(rgb, 0.3)}`,
                    boxShadow: picked ? "0 18px 44px rgba(255,203,5,0.28)" : "0 12px 28px rgba(0,0,0,0.28)",
                  }}
                >
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-14 h-4 rounded-sm" style={{ background: "rgba(255,255,255,0.2)" }} />
                  {picked && (
                    <span className="ideate-pop absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center shadow-lg" style={{ background: MAIZE, color: NAVY }}>
                      <Icon name="star" className="w-4 h-4" strokeWidth={2.4} />
                    </span>
                  )}
                  <button type="button" onClick={() => removeIdea(i)} aria-label="Remove idea" className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white/35 hover:text-white hover:bg-white/10 transition-colors">
                    <Icon name="x" className="w-3.5 h-3.5" strokeWidth={2.4} />
                  </button>
                  <span className="text-[10px] font-black tabular-nums" style={{ color: `rgb(${rgb})` }}>#{i + 1}</span>
                  <AutoTextarea
                    bare
                    rows={2}
                    maxLength={SHORT_TEXT}
                    value={idea.text}
                    onChange={(v) => update((x) => { x.stretch.ideas[i].text = v; })}
                    className="text-[15px] font-bold text-white leading-snug pr-5 mt-1"
                  />
                  {lensName && (
                    <span className="self-start mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)" }}>
                      <Icon name={LENS_ICONS[idea.lens]} className="w-3 h-3" /> {lensName}
                    </span>
                  )}
                  {unlocked && (
                    <div className="mt-auto pt-3">
                      <div className="pt-3 space-y-1.5" style={{ borderTop: "1px dashed rgba(255,255,255,0.15)" }}>
                        <ScoreRow icon="bolt" label="Impact" value={idea.impact} onChange={(n) => update((x) => { x.stretch.ideas[i].impact = n; })} />
                        <ScoreRow icon="wrench" label="Doable" value={idea.doable} onChange={(n) => update((x) => { x.stretch.ideas[i].doable = n; })} />
                        <ScoreRow icon="heart" label="Excites" value={idea.excite} onChange={(n) => update((x) => { x.stretch.ideas[i].excite = n; })} />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3">
                        <span className="text-[11px] font-bold tabular-nums text-white/50">{total > 0 ? `${total}/15` : ""}</span>
                        {filled(idea.text) && (
                          <button
                            type="button"
                            onClick={() => update((x) => { x.stretch.chosen = picked ? -1 : i; })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                            style={picked ? { background: MAIZE, color: NAVY } : { background: "rgba(11,26,59,0.55)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)" }}
                          >
                            <Icon name="star" className="w-3.5 h-3.5" />
                            {picked ? "Chosen" : "Choose"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-6 rounded-2xl p-8 text-center" style={{ border: "2px dashed rgba(255,255,255,0.1)" }}>
            <Icon name="grid" className="w-8 h-8 mx-auto text-white/20" />
            <p className="text-sm text-white/40 mt-2">Your ideas will pin up here.</p>
          </div>
        )}
      </div>

      {/* Lens deck */}
      <div>
        <Eyebrow>2 · Draw a lens</Eyebrow>
        <p className="text-xs text-white/45 -mt-1 mb-4 leading-relaxed">Pick a card and push yourself to come up with at least one idea that fits it.</p>
        <div className="relative">
          <div className="flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible no-scrollbar pt-3 pb-4 -mx-1 px-1 snap-x" aria-disabled={!unlocked}>
            {LENSES.map((l, i) => {
              const on = lensId === l.id;
              const used = ideas.some((idea) => idea.lens === l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => { setLensId(on ? "" : l.id); setLensDraft(""); }}
                  className="snap-start flex-shrink-0 w-[128px] sm:w-auto h-[172px] sm:h-[150px] rounded-2xl p-4 flex flex-col justify-between text-left relative overflow-hidden transition-all duration-300 hover:enabled:-translate-y-2 disabled:cursor-not-allowed"
                  style={on
                    ? { transform: "translateY(-8px)", background: "linear-gradient(160deg, var(--accent), rgb(var(--second-rgb)))", color: NAVY, boxShadow: `0 20px 44px ${accent(0.4)}` }
                    : { background: `linear-gradient(160deg, ${accent(0.18)}, rgba(var(--second-rgb), 0.06))`, border: `1px solid ${accent(0.28)}`, color: "white" }}
                >
                  <span className="pointer-events-none absolute -right-6 -bottom-6 w-24 h-24 rounded-full" style={{ border: `12px solid ${on ? "rgba(11,26,59,0.12)" : accent(0.1)}` }} />
                  <span className="flex items-center justify-between">
                    <Icon name={LENS_ICONS[l.id]} className="w-7 h-7" style={{ color: on ? NAVY : "var(--accent)" }} />
                    <span className="text-[10px] font-black opacity-50">{String(i + 1).padStart(2, "0")}</span>
                  </span>
                  <span>
                    <span className="block text-[15px] font-black leading-tight">{l.title}</span>
                    {used && <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold opacity-70"><Icon name="check" className="w-3 h-3" strokeWidth={3} /> Used</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {!unlocked && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl" style={{ background: "rgba(11,26,59,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}>
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold" style={{ background: "rgba(11,26,59,0.9)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Icon name="lock" className="w-4 h-4" /> Add {MIN_IDEAS - count} more idea{MIN_IDEAS - count === 1 ? "" : "s"} to unlock
              </span>
            </div>
          )}
        </div>
        {lens && unlocked && (
          <div key={lens.id} className="ideate-rise rounded-2xl p-5 sm:p-6" style={{ background: `linear-gradient(135deg, ${accent(0.14)}, rgba(255,255,255,0.02))`, border: `1px solid ${accent(0.3)}` }}>
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: "var(--accent)" }}>{lens.title}</p>
            <p className="text-base sm:text-xl font-bold text-white leading-snug mt-1.5">{lens.prompt}</p>
            <form className="flex gap-2 mt-4" onSubmit={(e) => { e.preventDefault(); addIdea(lensDraft, lens.id); setLensDraft(""); }}>
              <TextInput value={lensDraft} onChange={setLensDraft} placeholder="An idea through this lens…" disabled={full} />
              <PrimaryButton type="submit" disabled={!lensDraft.trim() || full} className="flex-shrink-0">Add</PrimaryButton>
            </form>
          </div>
        )}
        <CoachPanel {...coachProps} className="mt-6" actions={[{ mode: "stretch-provoke", label: "Push my thinking" }]} />
      </div>

      {/* Choose */}
      <div
        className="relative rounded-3xl p-5 sm:p-8 overflow-hidden transition-all duration-500"
        style={chosen
          ? { background: "radial-gradient(ellipse 70% 80% at 50% 0%, rgba(255,203,5,0.16), transparent 65%), rgba(255,255,255,0.03)", border: "1px solid rgba(255,203,5,0.35)" }
          : { ...SUBTLE, opacity: unlocked ? 1 : 0.5 }}
      >
        <p className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: chosen ? MAIZE : "var(--accent)" }}>3 · Choose one</p>
        {chosen ? (
          <div key={data.stretch.chosen} className="ideate-pop flex items-start gap-3 mt-3">
            <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: MAIZE, color: NAVY }}>
              <Icon name="star" className="w-5 h-5" strokeWidth={2.4} />
            </span>
            <h3 className="text-xl sm:text-3xl font-black text-white tracking-tight leading-tight pt-0.5">{chosen.text}</h3>
          </div>
        ) : (
          <p className="text-sm text-white/55 mt-2 leading-relaxed max-w-2xl">
            Score your notes with the dots (impact, how doable, how exciting), then tap <span className="font-bold text-white">Choose</span> on the one you&rsquo;ll take forward. The highest score doesn&rsquo;t have to win.
          </p>
        )}
        <div className="mt-6">
          <Field label={chosen ? "How would it work?" : "How would your chosen idea work?"} hint="Two or three sentences. What does the person you pictured actually experience?">
            <AutoTextarea value={data.stretch.solution} onChange={(v) => update((x) => { x.stretch.solution = v; })} placeholder="It works like this…" rows={3} disabled={!chosen} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─── 6 · Stress ────────────────────────────────────────────────────────

function Skeptic({ size = 40 }) {
  return (
    <span className="rounded-full flex items-center justify-center flex-shrink-0 font-black text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 45%), linear-gradient(135deg, var(--accent), rgb(var(--second-rgb)))", boxShadow: `0 8px 20px ${accent(0.35)}` }}>
      ?!
    </span>
  );
}

export function StressStage({ data, update, askCoach, coachProps }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const objections = data.stress.objections;
  const answered = objections.filter((o) => filled(o.answer)).length;
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
    <div className="space-y-10">
      <Carry icon="star" rgb={STAGE_THEME.stretch.rgb} label="Your solution:">{data.stretch.solution}</Carry>

      <div>
        <Eyebrow
          right={
            objections.length > 0 && (
              <span className="flex items-center gap-1.5" aria-label={`${answered} of ${OBJECTION_COUNT} answered`}>
                {Array.from({ length: OBJECTION_COUNT }, (_, i) => (
                  <Icon key={i} name={i < answered ? "shieldCheck" : "shield"} className="w-5 h-5 transition-colors" style={{ color: i < answered ? "#34D399" : "rgba(255,255,255,0.2)" }} strokeWidth={2} />
                ))}
              </span>
            )
          }
        >
          The hot seat
        </Eyebrow>

        {objections.length === 0 ? (
          <div className="relative rounded-3xl p-6 sm:p-10 text-center overflow-hidden" style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent(0.18)}, transparent 60%), rgba(255,255,255,0.03)`, border: `1px solid ${accent(0.25)}` }}>
            <div className={`mx-auto w-fit ${busy ? "" : "ideate-float"}`}><Skeptic size={72} /></div>
            <h3 className="text-xl sm:text-2xl font-black text-white mt-5 tracking-tight">Ready to take the heat?</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-md mx-auto mt-2">
              The coach will play a tough investor and a doubtful customer, and raise the three hardest objections to your idea. Your job is to answer them.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <PrimaryButton onClick={() => bring(false)} disabled={busy || Boolean(blocked) || left === 0}>
                <Icon name="bolt" className="w-4 h-4" strokeWidth={2.4} />
                {busy ? "Sharpening objections…" : "Bring on the objections"}
              </PrimaryButton>
              <button type="button" onClick={() => bring(true)} className="text-xs text-white/45 hover:text-white/80 underline-offset-4 hover:underline">
                or use three standard objections
              </button>
            </div>
            {busy && <div className="mt-5 flex justify-center"><span className="ideate-typing flex gap-1"><span /><span /><span /></span></div>}
            {error && <p className="text-xs text-red-300 mt-3">{error}</p>}
          </div>
        ) : (
          <>
            <ol className="space-y-7">
              {objections.map((o, i) => {
                const done = filled(o.answer);
                return (
                  <li key={i} className="ideate-rise space-y-3" style={{ animationDelay: `${i * 140}ms` }}>
                    <div className="flex items-end gap-3 pr-6 sm:pr-16">
                      <Skeptic />
                      <div className="rounded-2xl rounded-bl-sm px-4 py-3" style={{ background: accent(0.13), border: `1px solid ${accent(0.32)}` }}>
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: "var(--accent)" }}>
                          Objection {i + 1}{o.label ? ` · ${o.label}` : ""}
                        </p>
                        <p className="text-[15px] sm:text-base text-white font-semibold leading-relaxed mt-1">{o.text}</p>
                      </div>
                    </div>
                    <div className="flex items-end gap-3 pl-6 sm:pl-16">
                      <div className="flex-1 min-w-0 rounded-2xl rounded-br-sm p-1" style={{ background: "rgba(255,203,5,0.06)", border: `1px solid ${done ? "rgba(52,211,153,0.45)" : "rgba(255,203,5,0.22)"}` }}>
                        <AutoTextarea
                          value={o.answer}
                          onChange={(v) => update((x) => { x.stress.objections[i].answer = v; })}
                          placeholder="Your answer…"
                          style={{ background: "transparent", border: "none" }}
                        />
                      </div>
                      <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black transition-all" style={done ? { background: "#34D399", color: NAVY } : { background: MAIZE, color: NAVY }}>
                        {done ? <Icon name="shieldCheck" className="w-5 h-5" strokeWidth={2.2} /> : "You"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            {answered === 0 && (
              <button type="button" onClick={() => update((x) => { x.stress.objections = []; })} className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/70">
                <Icon name="refresh" className="w-3.5 h-3.5" /> Start over with different objections
              </button>
            )}
            <CoachPanel {...coachProps} className="mt-7" actions={[{ mode: "stress-review", label: "How did I do?" }]} />
          </>
        )}
      </div>

      <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid rgba(255,203,5,0.28)", background: "rgba(255,255,255,0.03)" }}>
        <div className="ideate-hazard h-2.5 opacity-80" />
        <div className="p-5 sm:p-7 space-y-7">
          <Field icon="warning" iconRgb="255, 203, 5" label="What's your riskiest assumption?" hint="The one thing that, if it's wrong, sinks the whole idea. Usually it's about whether people will change what they do.">
            <AutoTextarea value={data.stress.assumption} onChange={(v) => update((x) => { x.stress.assumption = v; })} placeholder="I'm assuming that…" />
          </Field>
          <div className="flex items-center gap-3 text-white/30">
            <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 6px, transparent 6px 12px)" }} />
            <Icon name="arrowDown" className="w-4 h-4" />
            <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 6px, transparent 6px 12px)" }} />
          </div>
          <Field icon="flask" iconRgb="52, 211, 153" label="What's the cheapest way to test it this week?" hint="No building allowed. Think conversations, a sign-up sheet, a fake flyer, doing it by hand for three people.">
            <AutoTextarea value={data.stress.test} onChange={(v) => update((x) => { x.stress.test = v; })} placeholder="This week I could…" />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─── 7 · Pitch ─────────────────────────────────────────────────────────

function NotesDrawer({ data }) {
  const [open, setOpen] = useState(false);
  const chosen = data.stretch.ideas[data.stretch.chosen];
  const rows = [
    ["Problem", problemSentence(data), STAGE_THEME.dig.rgb],
    ["Person", data.who.person, STAGE_THEME.who.rgb],
    ["Today", data.who.today, STAGE_THEME.who.rgb],
    ["Solution", [chosen?.text, data.stretch.solution].filter(Boolean).join(": "), STAGE_THEME.stretch.rgb],
    ["Riskiest assumption", data.stress.assumption, STAGE_THEME.stress.rgb],
  ];
  return (
    <div className="rounded-2xl" style={SUBTLE}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5">
        <span className="flex items-center gap-2.5 text-sm font-bold text-white/85">
          <Icon name="book" className="w-4 h-4" style={{ color: "var(--accent)" }} /> Your notes so far
        </span>
        <span className="text-xs font-semibold text-white/45">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <dl className="ideate-fade px-4 pb-4 grid gap-2.5">
          {rows.map(([k, v, rgb]) => (
            <div key={k} className="pl-3" style={{ borderLeft: `2px solid rgb(${rgb})` }}>
              <dt className="text-[10px] uppercase tracking-wider text-white/40">{k}</dt>
              <dd className="text-sm text-white/80 leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function PitchTimeline({ pitch, onBeat, compact = false }) {
  const secs = pitchSeconds(pitch);
  const color = secs <= PITCH_SECONDS ? "#34D399" : secs <= PITCH_SECONDS + 10 ? MAIZE : "#F87171";
  return (
    <div>
      <div className={`flex gap-1 ${compact ? "h-3" : "h-12 sm:h-14"}`}>
        {PITCH_BEATS.map((b) => {
          const rgb = BEAT_COLORS[b.id];
          const s = wordCount(pitch[b.id]) / WORDS_PER_SECOND;
          const pct = Math.min(1, s / b.seconds);
          const over = s > b.seconds * 1.5;
          const Tag = onBeat ? "button" : "div";
          return (
            <Tag
              key={b.id}
              {...(onBeat ? { type: "button", onClick: () => onBeat(b.id), "aria-label": `Jump to ${b.label}` } : {})}
              className={`relative ${compact ? "rounded-sm" : "rounded-lg"} overflow-hidden text-left min-w-0`}
              style={{ flexGrow: b.seconds, flexBasis: 0, background: tint(rgb, 0.14), border: compact ? "none" : `1px solid ${tint(rgb, 0.3)}` }}
            >
              <span
                className="absolute inset-y-0 left-0 transition-all duration-500"
                style={{
                  width: `${pct * 100}%`,
                  background: over ? `repeating-linear-gradient(-45deg, rgba(248,113,113,0.9) 0 6px, rgba(248,113,113,0.55) 6px 12px)` : `linear-gradient(90deg, ${tint(rgb, 0.55)}, ${tint(rgb, 0.9)})`,
                }}
              />
              {!compact && (
                <>
                  <span className="relative hidden sm:block px-2 pt-1.5 text-[10px] uppercase tracking-wider font-black text-white truncate">{b.label}</span>
                  <span className="relative hidden sm:block px-2 text-[10px] text-white/80 tabular-nums">{Math.round(s)}/{b.seconds}s</span>
                </>
              )}
            </Tag>
          );
        })}
      </div>
      {!compact && (
        <div className="flex justify-between text-[10px] text-white/35 tabular-nums mt-1.5">
          <span>0:00</span>
          <span style={{ color }}>{formatClock(secs)}</span>
          <span>1:00</span>
        </div>
      )}
    </div>
  );
}

export function PitchStage({ data, update, coachProps }) {
  const secs = pitchSeconds(data.pitch);
  const status = secs === 0
    ? { text: "Start writing", rgb: "255, 255, 255" }
    : secs <= PITCH_SECONDS
    ? { text: "Fits in a minute", rgb: "52, 211, 153" }
    : secs <= PITCH_SECONDS + 10
    ? { text: "A little long", rgb: "255, 203, 5" }
    : { text: "Too long, trim it", rgb: "248, 113, 113" };

  const focusBeat = (id) => {
    const el = document.getElementById(`ideate-beat-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.querySelector("textarea")?.focus({ preventScroll: true }), 350);
  };

  let start = 0;
  return (
    <div className="space-y-8">
      <div
        className="relative rounded-3xl p-5 sm:p-7 overflow-hidden"
        style={{ background: "radial-gradient(ellipse 55% 100% at 50% -20%, rgba(255,255,255,0.16), transparent 60%), linear-gradient(180deg, rgba(96,165,250,0.08), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: "var(--accent)" }}>On the clock</p>
            <p className="font-black tabular-nums leading-none mt-2 transition-colors" style={{ fontSize: "clamp(2.75rem, 8vw, 4.5rem)", color: secs === 0 ? "rgba(255,255,255,0.3)" : `rgb(${status.rgb})` }}>
              {formatClock(secs)}
            </p>
            <p className="text-xs text-white/45 mt-2">of 1:00 · estimated at a relaxed speaking pace</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ background: tint(status.rgb, 0.14), color: `rgb(${status.rgb})`, border: `1px solid ${tint(status.rgb, 0.35)}` }}>
            <Icon name="clock" className="w-3.5 h-3.5" /> {status.text}
          </span>
        </div>
        <div className="mt-6">
          <PitchTimeline pitch={data.pitch} onBeat={focusBeat} />
        </div>
      </div>

      <NotesDrawer data={data} />

      <ol className="space-y-4">
        {PITCH_BEATS.map((b, i) => {
          const rgb = BEAT_COLORS[b.id];
          const s = Math.round(wordCount(data.pitch[b.id]) / WORDS_PER_SECOND);
          const from = start;
          start += b.seconds;
          return (
            <li
              key={b.id}
              id={`ideate-beat-${b.id}`}
              className="ideate-rise relative rounded-2xl p-4 sm:p-5 pl-5 sm:pl-7 overflow-hidden"
              style={{ background: `linear-gradient(90deg, ${tint(rgb, 0.1)}, rgba(255,255,255,0.02) 45%)`, border: "1px solid rgba(255,255,255,0.08)", animationDelay: `${i * 70}ms` }}
            >
              <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: `rgb(${rgb})` }} />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="flex items-center gap-2.5">
                  <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md font-bold" style={{ background: tint(rgb, 0.18), color: `rgb(${rgb})` }}>
                    {formatClock(from)}–{formatClock(from + b.seconds)}
                  </span>
                  <span className="text-[15px] sm:text-base font-black text-white">{b.label}</span>
                </p>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: s > b.seconds * 1.5 ? "#F87171" : "rgba(255,255,255,0.4)" }}>~{s}s of {b.seconds}s</span>
              </div>
              <p className="text-xs text-white/50 mt-1.5 mb-3 leading-relaxed">{b.prompt}</p>
              <AutoTextarea value={data.pitch[b.id]} onChange={(v) => update((x) => { x.pitch[b.id] = v; })} placeholder="Write it the way you'd say it…" />
            </li>
          );
        })}
      </ol>

      <CoachPanel {...coachProps} className="" actions={[{ mode: "pitch-coach", label: "Coach my pitch" }]} />
    </div>
  );
}

export const STAGE_VIEWS = {
  spark: SparkStage,
  dig: DigStage,
  who: WhoStage,
  check: CheckStage,
  stretch: StretchStage,
  stress: StressStage,
  pitch: PitchStage,
};
