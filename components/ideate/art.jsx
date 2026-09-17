// Ideate icons and stage illustrations. Everything draws in currentColor so a
// parent's `color` (usually the stage accent) sets the tint.

const ICONS = {
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3z" />,
  book: <path d="M4 19V5a2 2 0 012-2h13v14H6a2 2 0 00-2 2zm0 0a2 2 0 002 2h13M9 7h6" />,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  dig: <path d="M12 3v10m0 0l-4-4m4 4l4-4M4 17h16M7 21h10" />,
  person: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5M8 11l2 2 4-4" /></>),
  branch: <path d="M12 21V12M12 12L5 5M12 12l7-7M5 5v5M5 5h5M19 5v5M19 5h-5" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />,
  shieldCheck: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5" />,
  mic: (<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4M8 22h8" /></>),
  layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>),
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>),
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z" />,
  flask: <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 001.3 2h12.4a1.5 1.5 0 001.3-2L14 9V3M7 15h10" />,
  warning: <path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  wrench: <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5z" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  check: <path d="M5 12l5 5L20 7" />,
  sparkles: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>),
  copy: (<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  gem: <path d="M6 3h12l3 6-9 12L3 9l3-6zM3 9h18M12 21L8.5 9 12 3l3.5 6L12 21" />,
  handshake: <path d="M2 11l4-4h4l2 2 2-2h4l4 4-6 6-3-3-3 3-8-6zM9 14l2 2" />,
  tag: (<><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
  swap: <path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4" />,
  mountain: <path d="M2 20l7-12 4 6 3-4 6 10H2z" />,
  scissors: (<><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="M8.5 8.5L20 19M8.5 15.5L20 5" /></>),
  refresh: <path d="M20 11a8 8 0 00-14.9-3M4 4v4h4M4 13a8 8 0 0014.9 3M20 20v-4h-4" />,
  quote: <path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6" />,
};

export function Icon({ name, className = "w-5 h-5", strokeWidth = 1.8, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || ICONS.sparkles}
    </svg>
  );
}

// ─── Stage illustrations ───────────────────────────────────────────────
// 200×160 line art, drawn in currentColor with a white highlight.

function SparkArt() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g>
      <circle cx="100" cy="70" r="46" fill="currentColor" opacity="0.08" />
      <circle cx="100" cy="70" r="30" fill="currentColor" opacity="0.14" />
      {rays.map((deg, i) => (
        <line
          key={deg}
          className="ideate-twinkle"
          style={{ animationDelay: `${i * 0.2}s` }}
          x1="100" y1="14" x2="100" y2="4"
          transform={`rotate(${deg} 100 70)`}
          stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        />
      ))}
      <path d="M100 38a26 26 0 00-15 47.3c2.6 2 4 5 4 8.2V100h22v-6.5c0-3.2 1.4-6.2 4-8.2A26 26 0 00100 38z" fill="rgba(11,26,59,0.6)" stroke="currentColor" strokeWidth="3" />
      <path d="M92 76l8-10 8 10-8 10z" fill="currentColor" />
      <path d="M90 108h20M93 116h14" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function DigArt() {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M10 ${46 + i * 26} C 50 ${38 + i * 26}, 80 ${56 + i * 26}, 120 ${46 + i * 26} S 170 ${40 + i * 26}, 190 ${48 + i * 26} L190 ${72 + i * 26} L10 ${72 + i * 26}Z`}
          fill="currentColor"
          opacity={0.06 + i * 0.07}
        />
      ))}
      <line x1="100" y1="12" x2="100" y2="118" stroke="currentColor" strokeWidth="3" strokeDasharray="6 7" className="ideate-dash" />
      <path d="M88 12h24l-12 14z" fill="#fff" fillOpacity="0.85" />
      <circle cx="100" cy="132" r="14" fill="currentColor" opacity="0.25" className="ideate-twinkle" />
      <path d="M92 132l8-10 8 10-8 10z" fill="currentColor" />
    </g>
  );
}

function WhoArt() {
  return (
    <g>
      {[62, 46, 30].map((r, i) => (
        <circle key={r} cx="100" cy="80" r={r} fill="none" stroke="currentColor" strokeOpacity={0.18 + i * 0.14} strokeWidth="2" strokeDasharray={i === 0 ? "4 6" : undefined} className={i === 0 ? "ideate-dash" : undefined} />
      ))}
      <circle cx="100" cy="68" r="12" fill="currentColor" />
      <path d="M78 104a22 22 0 0144 0" fill="currentColor" opacity="0.85" />
      <circle cx="152" cy="34" r="5" fill="#fff" opacity="0.8" className="ideate-twinkle" />
      <circle cx="46" cy="124" r="4" fill="currentColor" className="ideate-twinkle" style={{ animationDelay: "0.8s" }} />
    </g>
  );
}

function CheckArt() {
  return (
    <g>
      <rect x="34" y="92" width="18" height="40" rx="4" fill="currentColor" opacity="0.25" />
      <rect x="60" y="72" width="18" height="60" rx="4" fill="currentColor" opacity="0.45" />
      <rect x="86" y="52" width="18" height="80" rx="4" fill="currentColor" opacity="0.7" />
      <line x1="24" y1="136" x2="118" y2="136" stroke="#fff" strokeOpacity="0.3" strokeWidth="2" />
      <circle cx="132" cy="66" r="30" fill="rgba(11,26,59,0.55)" stroke="currentColor" strokeWidth="5" />
      <path d="M154 88l22 22" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <path d="M120 66l8 8 16-16" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function StretchArt() {
  const ends = [[30, 36, 7], [62, 16, 5], [118, 14, 6], [166, 30, 8], [182, 84, 5], [20, 94, 5]];
  return (
    <g>
      {ends.map(([x, y, r], i) => (
        <g key={i}>
          <path d={`M100 120 Q ${(100 + x) / 2} ${y + 50}, ${x} ${y}`} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="5 6" className="ideate-dash" />
          <circle cx={x} cy={y} r={r} fill={i % 2 ? "#fff" : "currentColor"} opacity={i % 2 ? 0.8 : 1} className="ideate-twinkle" style={{ animationDelay: `${i * 0.35}s` }} />
        </g>
      ))}
      <circle cx="100" cy="120" r="22" fill="currentColor" opacity="0.2" />
      <circle cx="100" cy="120" r="12" fill="currentColor" />
    </g>
  );
}

function StressArt() {
  return (
    <g>
      <path d="M100 26l44 16v32c0 28-19 44-44 50-25-6-44-22-44-50V42l44-16z" fill="currentColor" opacity="0.16" stroke="currentColor" strokeWidth="3.5" />
      <path d="M84 76l12 12 22-24" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 30l18 10-8 4 16 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ideate-twinkle" />
      <path d="M182 40l-16 8 7 5-15 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ideate-twinkle" style={{ animationDelay: "0.9s" }} />
      <path d="M170 130l-18-8 4-6-14-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ideate-twinkle" style={{ animationDelay: "1.6s" }} />
    </g>
  );
}

function PitchArt() {
  return (
    <g>
      <path d="M100 4L44 150h112L100 4z" fill="url(#ideate-spot)" />
      <defs>
        <linearGradient id="ideate-spot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="88" y="44" width="24" height="46" rx="12" fill="currentColor" />
      <path d="M78 76a22 22 0 0044 0M100 98v18M88 118h24" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="4" strokeLinecap="round" />
      {[1, 2, 3].map((i) => (
        <g key={i} className="ideate-twinkle" style={{ animationDelay: `${i * 0.3}s` }}>
          <path d={`M${128 + i * 12} ${52 - i * 4}a${18 + i * 12} ${18 + i * 12} 0 010 ${40 + i * 8}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity={1 - i * 0.22} />
          <path d={`M${72 - i * 12} ${52 - i * 4}a${18 + i * 12} ${18 + i * 12} 0 000 ${40 + i * 8}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity={1 - i * 0.22} />
        </g>
      ))}
    </g>
  );
}

const ART = { spark: SparkArt, dig: DigArt, who: WhoArt, check: CheckArt, stretch: StretchArt, stress: StressArt, pitch: PitchArt };

export function StageArt({ stageId, className = "w-40 h-32" }) {
  const Art = ART[stageId] || SparkArt;
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" aria-hidden="true" style={{ color: "var(--accent)" }}>
      <Art />
    </svg>
  );
}
