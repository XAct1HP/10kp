// Ideate curriculum — the shared shape of a student's workspace.
//
// Imported by BOTH the /ideate page and the /api/ideate routes, so it must
// stay free of server-only imports. Everything the page saves passes through
// sanitizeIdeateData() on the server, which is the only thing standing between
// a hand-crafted request and the database / the UMGPT prompt.

export const DAILY_COACH_LIMIT = 40;
export const MAX_RUNGS = 5;
export const MIN_IDEAS = 5;
export const MAX_IDEAS = 20;
export const OBJECTION_COUNT = 3;
export const COACH_HISTORY = 6;
export const WORDS_PER_SECOND = 2.5; // ~150 wpm, a comfortable speaking pace
// A pitch should land between one minute and a minute and a half.
export const PITCH_MIN_SECONDS = 60;
export const PITCH_MAX_SECONDS = 90;

export const SHORT_TEXT = 300;
export const LONG_TEXT = 1200;
const SHORT = SHORT_TEXT;
const LONG = LONG_TEXT;

export const STEPS = [
  { id: "spark",   label: "Spark",   title: "Start with a spark",        blurb: "Pick a way in and write your idea as a single sentence. It can be rough. You'll sharpen it on the next steps." },
  { id: "dig",     label: "Dig",     title: "Find the real problem",     blurb: "The first problem you name usually sits on top of a deeper one. Keep asking why until you hit the real one." },
  { id: "who",     label: "Who",     title: "Make the person real",      blurb: "“Everyone” isn't a customer. Picture one real person who has this problem." },
  { id: "check",   label: "Check",   title: "Is it worth solving?",      blurb: "Before you build anything, check that the problem is real, common enough, and not already solved." },
  { id: "stretch", label: "Stretch", title: "Go wide, then choose",      blurb: "Your first solution is rarely your best. Come up with a lot of options, look at them from new angles, then pick one." },
  { id: "stress",  label: "Stress",  title: "Argue against yourself",    blurb: "Find the weak spots now, before a judge or a customer points them out." },
  { id: "pitch",   label: "Pitch",   title: "Shape your pitch",          blurb: "Turn what you've built into the beats of a 60 to 90 second pitch, then take it and record." },
];

export const DOORS = [
  { id: "annoy", title: "Something annoys me",        prompt: "What keeps going wrong, wastes your time, or makes you think “why is this so hard?”" },
  { id: "know",  title: "Something I know really well", prompt: "A job, hobby, major, or community you know from the inside. What do outsiders get wrong about it?" },
  { id: "trend", title: "A change I see coming",      prompt: "A new technology, habit, or rule that's shifting how people live. Who gets left behind, or who wins?" },
];

export const FIRST_WHY = "What exactly goes wrong, and why does it bother you?";
export const FALLBACK_WHY = "Why is that a problem? What happens because of it?";

export const LENSES = [
  { id: "no-product", title: "No product allowed",      prompt: "Solve it without building a physical thing or an app: a service, a habit, a rule, or a partnership." },
  { id: "ten-x",      title: "10× cheaper",             prompt: "What if your solution had to cost a tenth as much, or be completely free for the user?" },
  { id: "borrow",     title: "Borrow from elsewhere",   prompt: "Pick an unrelated industry, like restaurants, airlines, video games, or hospitals. How would they solve this?" },
  { id: "extreme",    title: "Design for the extreme",  prompt: "Build for the person who has this problem worst. What do they need that everyone else would love too?" },
  { id: "remove",     title: "Remove the step",         prompt: "Instead of improving the painful step, what if it didn't need to happen at all?" },
  { id: "flip",       title: "Flip who does the work",  prompt: "What if someone else carried the burden: the business, a neighbor, a machine, or the community?" },
];

export const FALLBACK_OBJECTIONS = [
  { label: "Why switch?",     text: "Why won't people just keep doing what they do today? What makes switching worth the effort?" },
  { label: "Why you?",        text: "Why hasn't someone already built this, or if they have, why would anyone pick yours?" },
  { label: "Reach and money", text: "How will the people who need this find out it exists, and who pays for it?" },
];

export const PITCH_BEATS = [
  { id: "hook",     label: "Hook",           seconds: 10, prompt: "One line that makes someone lean in: a surprising fact, a question, or a moment everyone recognizes." },
  { id: "problem",  label: "Problem",        seconds: 20, prompt: "The real problem you dug up, in plain words." },
  { id: "who",      label: "Who has it",     seconds: 15, prompt: "The person you pictured, and what they put up with today." },
  { id: "solution", label: "Your solution",  seconds: 30, prompt: "What you'd do, and why it beats the workaround." },
  { id: "why",      label: "Why now / why you", seconds: 15, prompt: "What makes this the right moment, or you the right person to do it?" },
];

export const CHECK_RATINGS = [
  { id: "green",  label: "Worth pursuing",  hint: "Real people have it, today's fixes fall short, and enough people care." },
  { id: "yellow", label: "Promising, with doubts", hint: "Something's unclear. Keep going, but carry that doubt into Stress." },
  { id: "red",    label: "Not yet",         hint: "Already solved well, or too small. Go back to Dig and look for a deeper problem." },
];

export function emptyIdeateData() {
  return {
    spark: { door: "", idea: "" },
    dig: { rungs: [{ question: FIRST_WHY, answer: "" }], who: "", what: "", why: "" },
    who: { person: "", lastTime: "", today: "" },
    check: { existing: "", scale: "", payer: "", talkedTo: 0, rating: "" },
    stretch: { ideas: [], chosen: -1, solution: "" },
    stress: { objections: [], assumption: "", test: "" },
    pitch: { hook: "", problem: "", who: "", solution: "", why: "" },
    coach: {},
  };
}

// ─── Sanitising ────────────────────────────────────────────────────────

function str(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").slice(0, max);
}

function int(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function oneOf(value, ids) {
  return ids.includes(value) ? value : "";
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function sanitizeCoachReply(reply) {
  const r = obj(reply);
  return {
    mode: str(r.mode, 40),
    message: str(r.message, 700),
    bullets: arr(r.bullets)
      .slice(0, 5)
      .map((b) => ({ label: str(obj(b).label, 90), text: str(obj(b).text, 450) }))
      .filter((b) => b.label || b.text),
    question: str(r.question, 320),
    at: str(r.at, 40),
  };
}

// Coerce anything into a well-formed workspace. Unknown keys are dropped,
// strings are capped, arrays are bounded.
export function sanitizeIdeateData(input) {
  const d = obj(input);
  const base = emptyIdeateData();

  const spark = obj(d.spark);
  base.spark = { door: oneOf(spark.door, DOORS.map((x) => x.id)), idea: str(spark.idea, SHORT) };

  const dig = obj(d.dig);
  const rungs = arr(dig.rungs)
    .slice(0, MAX_RUNGS)
    .map((r) => ({ question: str(obj(r).question, SHORT), answer: str(obj(r).answer, LONG) }));
  base.dig = {
    rungs: rungs.length ? rungs : base.dig.rungs,
    who: str(dig.who, SHORT),
    what: str(dig.what, SHORT),
    why: str(dig.why, SHORT),
  };

  const who = obj(d.who);
  base.who = { person: str(who.person, LONG), lastTime: str(who.lastTime, LONG), today: str(who.today, LONG) };

  const check = obj(d.check);
  base.check = {
    existing: str(check.existing, LONG),
    scale: str(check.scale, LONG),
    payer: str(check.payer, LONG),
    talkedTo: int(check.talkedTo, 0, 99, 0),
    rating: oneOf(check.rating, CHECK_RATINGS.map((x) => x.id)),
  };

  const stretch = obj(d.stretch);
  const lensIds = LENSES.map((l) => l.id);
  const ideas = arr(stretch.ideas)
    .slice(0, MAX_IDEAS)
    .map((i) => {
      const idea = obj(i);
      return {
        text: str(idea.text, SHORT),
        lens: oneOf(idea.lens, lensIds),
        impact: int(idea.impact, 0, 5, 0),
        doable: int(idea.doable, 0, 5, 0),
        excite: int(idea.excite, 0, 5, 0),
      };
    });
  base.stretch = {
    ideas,
    chosen: int(stretch.chosen, -1, ideas.length - 1, -1),
    solution: str(stretch.solution, LONG),
  };

  const stress = obj(d.stress);
  base.stress = {
    objections: arr(stress.objections)
      .slice(0, OBJECTION_COUNT)
      .map((o) => ({ label: str(obj(o).label, 90), text: str(obj(o).text, 450), answer: str(obj(o).answer, LONG) })),
    assumption: str(stress.assumption, LONG),
    test: str(stress.test, LONG),
  };

  const pitch = obj(d.pitch);
  for (const beat of PITCH_BEATS) base.pitch[beat.id] = str(pitch[beat.id], LONG);

  const coach = obj(d.coach);
  for (const step of STEPS) {
    const list = arr(coach[step.id]).slice(-COACH_HISTORY).map(sanitizeCoachReply);
    if (list.length) base.coach[step.id] = list;
  }

  return base;
}

// ─── Progress rules ────────────────────────────────────────────────────

export function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

const filled = (s) => typeof s === "string" && s.trim().length > 0;

export function answeredRungs(data) {
  return data.dig.rungs.filter((r) => filled(r.answer)).length;
}

export function namedIdeas(data) {
  return data.stretch.ideas.filter((i) => filled(i.text));
}

// Can the student move on from this step? Returns { ok, hint }.
export function stepReady(stepId, data) {
  switch (stepId) {
    case "spark":
      if (!data.spark.door) return { ok: false, hint: "Pick a way in." };
      if (wordCount(data.spark.idea) < 3) return { ok: false, hint: "Write your idea in a sentence." };
      return { ok: true };
    case "dig":
      if (answeredRungs(data) < 2) return { ok: false, hint: "Go at least two levels deep." };
      if (!filled(data.dig.who) || !filled(data.dig.what) || !filled(data.dig.why))
        return { ok: false, hint: "Finish your problem statement." };
      return { ok: true };
    case "who":
      if (!filled(data.who.person) || !filled(data.who.lastTime) || !filled(data.who.today))
        return { ok: false, hint: "Answer all three questions." };
      return { ok: true };
    case "check":
      if (!filled(data.check.existing) || !filled(data.check.scale) || !filled(data.check.payer))
        return { ok: false, hint: "Answer all three questions." };
      if (!data.check.rating) return { ok: false, hint: "Give it an honest rating." };
      return { ok: true };
    case "stretch":
      if (namedIdeas(data).length < MIN_IDEAS) return { ok: false, hint: `List at least ${MIN_IDEAS} ideas.` };
      if (data.stretch.chosen < 0 || !filled(data.stretch.ideas[data.stretch.chosen]?.text))
        return { ok: false, hint: "Pick the idea you'll take forward." };
      if (!filled(data.stretch.solution)) return { ok: false, hint: "Describe your chosen solution." };
      return { ok: true };
    case "stress":
      if (data.stress.objections.length < OBJECTION_COUNT) return { ok: false, hint: "Bring out the objections." };
      if (data.stress.objections.some((o) => !filled(o.answer))) return { ok: false, hint: "Answer every objection." };
      if (!filled(data.stress.assumption) || !filled(data.stress.test))
        return { ok: false, hint: "Name your riskiest assumption and a test for it." };
      return { ok: true };
    case "pitch":
      if (PITCH_BEATS.some((b) => !filled(data.pitch[b.id]))) return { ok: false, hint: "Fill in every beat." };
      return { ok: true };
    default:
      return { ok: false, hint: "" };
  }
}

// The furthest step a student may open: every earlier step must be ready.
export function furthestUnlocked(data) {
  let i = 0;
  while (i < STEPS.length - 1 && stepReady(STEPS[i].id, data).ok) i += 1;
  return i;
}

export function pitchSeconds(pitch) {
  const words = PITCH_BEATS.reduce((n, b) => n + wordCount(pitch[b.id]), 0);
  return Math.round(words / WORDS_PER_SECOND);
}

// ─── Coach prerequisites ───────────────────────────────────────────────
// Each coach request reacts to something the student wrote, so it stays
// locked until that exists. Returns null when ready, else the reason.
// Shared so the page can grey out buttons and the API can refuse.
export const COACH_PREREQS = {
  "dig-next": (d) => {
    const last = d.dig.rungs[d.dig.rungs.length - 1];
    if (d.dig.rungs.length >= MAX_RUNGS) return `You've gone ${MAX_RUNGS} levels deep. That's far enough.`;
    if (!last || !filled(last.answer)) return "Answer the current question first.";
    return null;
  },
  "dig-problem": (d) =>
    filled(d.dig.who) && filled(d.dig.what) && filled(d.dig.why) ? null : "Fill in all three parts of your problem statement first.",
  "who-sharpen": (d) => (filled(d.who.person) ? null : "Describe the person first."),
  "check-research": (d) =>
    filled(d.check.existing) ? null : "List what people use today first, even if it's “nothing I know of.”",
  "stretch-provoke": (d) => (namedIdeas(d).length >= MIN_IDEAS ? null : `List at least ${MIN_IDEAS} ideas of your own first.`),
  "stress-objections": (d) => (filled(d.stretch.solution) ? null : "Describe your chosen solution in Stretch first."),
  "stress-review": (d) =>
    d.stress.objections.length >= OBJECTION_COUNT && d.stress.objections.every((o) => filled(o.answer))
      ? null
      : "Answer every objection first.",
  "pitch-coach": (d) => (PITCH_BEATS.every((b) => filled(d.pitch[b.id])) ? null : "Draft every beat first."),
};

// The problem statement is stitched from three inputs; start it with a capital.
export function problemSentence(d) {
  const text = `${d.dig.who.trim()} struggles with ${d.dig.what.trim()} because ${d.dig.why.trim()}`.replace(/[.\s]+$/, "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
