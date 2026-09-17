"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./art";
import { MAIZE, NAVY } from "./theme";
import { LONG_TEXT, SHORT_TEXT } from "../../lib/ideate/curriculum";

export const GLASS = {
  background: "linear-gradient(180deg, rgba(16,32,68,0.72), rgba(11,26,59,0.72))",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
};

export const SUBTLE = { background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" };

export const tint = (rgb, a) => `rgba(${rgb}, ${a})`;
export const accent = (a) => `rgba(var(--accent-rgb), ${a})`;

export function AutoTextarea({ value, onChange, placeholder, rows = 2, maxLength = LONG_TEXT, className = "", style, bare = false, ...rest }) {
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
      className={
        bare
          ? `w-full bg-transparent resize-none overflow-hidden focus:outline-none placeholder-white/30 ${className}`
          : `ideate-input w-full px-4 py-3 rounded-xl text-sm sm:text-[15px] text-white placeholder-white/25 leading-relaxed resize-none overflow-hidden ${className}`
      }
      style={style}
      {...rest}
    />
  );
}

export function TextInput({ value, onChange, placeholder, maxLength = SHORT_TEXT, className = "", ...rest }) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`ideate-input w-full px-4 py-3 rounded-xl text-sm sm:text-[15px] text-white placeholder-white/25 ${className}`}
      {...rest}
    />
  );
}

export function IconBadge({ name, size = "w-9 h-9", iconSize = "w-[18px] h-[18px]", rgb, className = "" }) {
  const color = rgb ? `rgb(${rgb})` : "var(--accent)";
  const bg = rgb ? tint(rgb, 0.14) : accent(0.14);
  const border = rgb ? tint(rgb, 0.28) : accent(0.28);
  return (
    <span className={`${size} rounded-xl flex items-center justify-center flex-shrink-0 ${className}`} style={{ background: bg, color, border: `1px solid ${border}` }}>
      <Icon name={name} className={iconSize} />
    </span>
  );
}

export function Field({ label, hint, icon, iconRgb, children, className = "" }) {
  return (
    <div className={className}>
      <div className="flex items-start gap-3 mb-2.5">
        {icon && <IconBadge name={icon} rgb={iconRgb} size="w-8 h-8" iconSize="w-4 h-4" className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          <label className="block text-[15px] font-semibold text-white leading-snug">{label}</label>
          {hint && <p className="text-xs text-white/45 leading-relaxed mt-1">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Eyebrow({ children, right, className = "" }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: "var(--accent)" }}>
        {children}
      </p>
      {right}
    </div>
  );
}

export function PrimaryButton({ children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_10px_30px_rgba(255,203,5,0.3)] active:enabled:translate-y-0 ${className}`}
      style={{ background: MAIZE, color: NAVY }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function AccentButton({ children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:-translate-y-0.5 ${className}`}
      style={{ background: accent(0.14), color: "var(--accent)", border: `1px solid ${accent(0.35)}` }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white/75 hover:enabled:text-white hover:enabled:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
      style={{ border: "1px solid rgba(255,255,255,0.14)" }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ProgressRing({ value, size = 44, stroke = 4, color = "var(--accent)", track = "rgba(255,255,255,0.1)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

// Initials avatar for the persona the student describes.
export function personaName(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const head = t.split(/[,.;:\n(]/)[0].trim();
  const words = head.split(/\s+/).slice(0, 4).join(" ");
  return words.length > 32 ? `${words.slice(0, 30)}…` : words;
}

export function Avatar({ text, size = 56, rgb = "244, 114, 182" }) {
  const name = personaName(text);
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(a|an|the|my|our|one|some)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <span
      className="rounded-full flex items-center justify-center font-black text-white flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 45%), linear-gradient(135deg, rgb(${rgb}), rgba(167,139,250,0.9))`,
        boxShadow: `0 8px 24px ${tint(rgb, 0.35)}`,
      }}
    >
      {initials || <Icon name="person" className="w-1/2 h-1/2" />}
    </span>
  );
}
