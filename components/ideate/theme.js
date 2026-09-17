// Ideate visual theme. Each stage keeps the site's navy + maize base and adds
// its own accent so the seven stages feel like distinct places on one journey.
// Primary actions stay maize everywhere; the accent colours the stage's art,
// focus rings, coach and progress marks.

export const MAIZE = "#FFCB05";
export const NAVY = "#0B1A3B";

export const STAGE_THEME = {
  spark:   { accent: "#FFCB05", rgb: "255, 203, 5",   second: "255, 138, 0",   icon: "bulb",    tagline: "Every idea starts small" },
  dig:     { accent: "#FF8A3D", rgb: "255, 138, 61",  second: "214, 72, 45",   icon: "dig",     tagline: "Get below the surface" },
  who:     { accent: "#F472B6", rgb: "244, 114, 182", second: "167, 139, 250", icon: "person",  tagline: "Picture a real human" },
  check:   { accent: "#34D399", rgb: "52, 211, 153",  second: "45, 212, 191",  icon: "search",  tagline: "Reality check" },
  stretch: { accent: "#A78BFA", rgb: "167, 139, 250", second: "96, 165, 250",  icon: "branch",  tagline: "Think wider" },
  stress:  { accent: "#F87171", rgb: "248, 113, 113", second: "251, 146, 60",  icon: "shield",  tagline: "Take the heat" },
  pitch:   { accent: "#60A5FA", rgb: "96, 165, 250",  second: "255, 203, 5",   icon: "mic",     tagline: "Own the minute" },
};

export const stageVars = (stageId) => {
  const t = STAGE_THEME[stageId] || STAGE_THEME.spark;
  return { "--accent": t.accent, "--accent-rgb": t.rgb, "--second-rgb": t.second };
};

// Who the coach is being for each request.
export const COACH_ROLES = {
  "dig-problem": "The Editor",
  "who-sharpen": "Detail Hunter",
  "check-research": "The Researcher",
  "stretch-provoke": "The Provocateur",
  "stress-review": "Debate Coach",
  "pitch-coach": "Speech Coach",
};

export const DOOR_ICONS = { annoy: "bolt", know: "book", trend: "trend" };

export const LENS_ICONS = {
  "no-product": "handshake",
  "ten-x": "tag",
  borrow: "swap",
  extreme: "mountain",
  remove: "scissors",
  flip: "refresh",
};

// Sticky-note tints for the idea wall, cycled by position.
export const NOTE_TINTS = [
  "255, 203, 5",
  "244, 114, 182",
  "96, 165, 250",
  "52, 211, 153",
  "167, 139, 250",
  "251, 146, 60",
];
export const NOTE_TILTS = ["-1.6deg", "1.2deg", "-0.6deg", "1.8deg", "-1.1deg", "0.7deg"];

// One colour per pitch beat, used on the timeline and the cue cards.
export const BEAT_COLORS = {
  hook: "255, 203, 5",
  problem: "255, 138, 61",
  who: "244, 114, 182",
  solution: "167, 139, 250",
  why: "96, 165, 250",
};

export const RATING_COLORS = { green: "52, 211, 153", yellow: "255, 203, 5", red: "248, 113, 113" };
