"use client";

import { useEffect, useState } from "react";

/**
 * Sponsor disk in the top-right corner of the homepage.
 *
 * The disk always has 4 physical slots (at 7:30, 4:30, 1:30, 10:30 in disk-local
 * frame). It rotates exactly 90° clockwise per spin, so a different slot lands
 * in the visible bottom-left corner every time.
 *
 * Sponsor CONTENT is assigned to each slot based on the current step so the
 * visible order cycles through the sponsor list 1,2,3,...,N,1,2,3,... regardless
 * of how many sponsors are configured:
 *   1 sponsor  → 1,1,1,1,...
 *   2 sponsors → 1,2,1,2,...
 *   3 sponsors → 1,2,3,1,2,3,...
 *   5 sponsors → 1,2,3,4,5,1,2,3,4,5,...
 *
 * When N < 4 the same sponsor lives in multiple slots; when N > 4 slots get
 * reassigned to upcoming sponsors while they're offscreen.
 */

const SPIN_MS = 750;
const HOLD_MS = 2000;
const STEP_DEG = 90;
const SLOT_COUNT = 4;

const RESTING_ANGLE = 225;   // 7:30 position in standard math coords

// Two sizes of the same disk. Desktop is the original; mobile is scaled to
// roughly 60% so it tucks into the hero corner without swallowing the
// countdown or the headline underneath it.
//   BOX         visible container for the disk
//   DISK        disk diameter
//   OFFSET      pushes 3/4 of the disk offscreen (top-right)
//   SLOT_RADIUS where logos sit on the disk (~0.55 × radius)
//   SLOT_W/H    the logo box that rides in each slot
const VARIANTS = {
  desktop: { BOX: 280, DISK: 480, OFFSET: -240, SLOT_RADIUS: 132, SLOT_W: 280, SLOT_H: 100, LOGO_MAX_H: 72, LOGO_MAX_W: 250, labelClass: "text-base" },
  mobile:  { BOX: 172, DISK: 296, OFFSET: -148, SLOT_RADIUS: 82,  SLOT_W: 172, SLOT_H: 64,  LOGO_MAX_H: 44, LOGO_MAX_W: 150, labelClass: "text-xs" },
};

// Slot m sits at math angle (225 + m × 90)° on the disk, pre-rotated so it
// lands upright when the disk has spun m × 90° clockwise.
function slotsFor({ DISK, SLOT_RADIUS }) {
  return Array.from({ length: SLOT_COUNT }, (_, m) => {
    const angleDeg = RESTING_ANGLE + m * (360 / SLOT_COUNT);
    const rad = (angleDeg * Math.PI) / 180;
    return {
      m,
      px: DISK / 2 + SLOT_RADIUS * Math.cos(rad),
      py: DISK / 2 - SLOT_RADIUS * Math.sin(rad),
      preRotate: -m * (360 / SLOT_COUNT),
    };
  });
}

// Which sponsor should slot m display given the current step and N sponsors?
// Answer: the sponsor for the *next* step at which slot m becomes visible.
function sponsorForSlot(m, step, sponsors) {
  const N = sponsors.length;
  const stepsUntilVisible = (m - (step % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
  const visibleAtStep = step + stepsUntilVisible;
  return sponsors[visibleAtStep % N];
}

export default function SponsorSpotlight() {
  const [sponsors, setSponsors] = useState(null);
  const [step, setStep] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  // Rendering both sizes and hiding one with CSS would double the fetch and run
  // two spin timers out of phase, so the viewport picks the geometry instead.
  // Starts desktop and corrects on mount; the component renders nothing until
  // sponsors load, so there is no visible flip.
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sponsors");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setSponsors(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSponsors([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hold → spin → advance step → hold → ...
  useEffect(() => {
    if (!sponsors || sponsors.length === 0) return;
    let t;
    if (!isSpinning) {
      t = setTimeout(() => setIsSpinning(true), HOLD_MS);
    } else {
      t = setTimeout(() => {
        setStep((s) => s + 1);
        setIsSpinning(false);
      }, SPIN_MS);
    }
    return () => clearTimeout(t);
  }, [isSpinning, sponsors]);

  if (!sponsors || sponsors.length === 0) return null;

  // While spinning we target the NEXT step's rotation, driving the CSS transition.
  // When the spin ends, step increments and isSpinning goes false in the same render,
  // so the computed rotation is unchanged — no jump.
  const rotation = (step + (isSpinning ? 1 : 0)) * STEP_DEG;

  const V = isCompact ? VARIANTS.mobile : VARIANTS.desktop;
  const SLOTS = slotsFor(V);
  // Shading is authored for the full-size disk; scale it so the compact disk
  // doesn't read as a heavy black blob.
  const k = V.DISK / VARIANTS.desktop.DISK;
  const px = (n) => `${Math.round(n * k)}px`;

  // Which sponsor is (or is about to be) at the visible resting spot?
  // We cross-fade the disk face to match its `light_background` flag over the
  // spin duration, so the disk color settles by the time the logo lands.
  const restingStep = step + (isSpinning ? 1 : 0);
  const restingSponsor = sponsors[restingStep % sponsors.length];
  const showLightDisk = !!restingSponsor?.light_background;

  return (
    <div
      // Shown at both sizes now — the mobile hero reserves the top-right corner
      // for it, and the compact variant keeps it clear of the headline.
      className="block absolute top-0 right-0 z-20 overflow-hidden pointer-events-none"
      style={{ width: `${V.BOX}px`, height: `${V.BOX}px` }}
    >
      {/* Disk (background + all 4 slots) rotates as one unit */}
      <div
        className="absolute"
        style={{
          width: `${V.DISK}px`,
          height: `${V.DISK}px`,
          top: `${V.OFFSET}px`,
          right: `${V.OFFSET}px`,
          transform: `rotate(${rotation}deg)`,
          transition: `transform ${SPIN_MS}ms cubic-bezier(0.65, 0.02, 0.32, 1)`,
          transformOrigin: "center",
          willChange: "transform",
        }}
      >
        {/* Dark navy disk — always present so we never see through to the hero
            behind. The light face (below) fades IN on top of it when needed. */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 68%, #1e3568 0%, #0B1A3B 55%, #050f24 100%)",
            boxShadow:
              `0 ${px(10)} ${px(40)} rgba(0,0,0,0.45), inset -${px(30)} -${px(30)} ${px(80)} rgba(0,0,0,0.25), inset ${px(20)} ${px(20)} ${px(60)} rgba(255,255,255,0.04)`,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 68%, #ffffff 0%, #f3f5fa 55%, #dfe4ee 100%)",
            boxShadow:
              `inset -${px(30)} -${px(30)} ${px(80)} rgba(0,0,0,0.08), inset ${px(20)} ${px(20)} ${px(60)} rgba(255,255,255,0.6)`,
            border: "1px solid rgba(11,26,59,0.1)",
            opacity: showLightDisk ? 1 : 0,
            transition: `opacity ${SPIN_MS}ms ease`,
          }}
        />

        {/* Four slots. Each renders whichever sponsor it's currently assigned to. */}
        {SLOTS.map(({ m, px, py, preRotate }) => {
          const sponsor = sponsorForSlot(m, step, sponsors);
          if (!sponsor) return null;

          // Per-sponsor size multiplier. Applied as a scale transform so the
          // container geometry (slot position, disk edge margins) stays stable.
          const scale =
            Number.isFinite(Number(sponsor.size_multiplier)) && Number(sponsor.size_multiplier) > 0
              ? Number(sponsor.size_multiplier)
              : 1;
          const onLight = !!sponsor.light_background;

          const content = sponsor.logo_url ? (
            <img
              src={sponsor.logo_url}
              alt={sponsor.name}
              className="w-auto object-contain"
              style={{
                maxHeight: `${V.LOGO_MAX_H}px`,
                maxWidth: `${V.LOGO_MAX_W}px`,
                filter: onLight
                  ? "drop-shadow(0 1px 3px rgba(0,0,0,0.15))"
                  : "drop-shadow(0 2px 8px rgba(0,0,0,0.35))",
              }}
            />
          ) : (
            <span
              className={`${V.labelClass} font-semibold uppercase tracking-wide text-center px-3 whitespace-nowrap`}
              style={{ color: onLight ? "rgba(11,26,59,0.92)" : "rgba(255,255,255,0.95)" }}
            >
              {sponsor.name}
            </span>
          );

          const inner = (
            <div
              style={{
                width: `${V.SLOT_W}px`,
                height: `${V.SLOT_H}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // Per-sponsor scale — 1.0 default; smaller/larger via admin field.
                transform: `scale(${scale})`,
                transformOrigin: "center",
              }}
            >
              {content}
            </div>
          );

          return (
            <div
              // Stable per-slot key — slots persist across steps, only their
              // sponsor content swaps (harmlessly, while offscreen).
              key={`slot-${m}`}
              className="absolute pointer-events-auto"
              style={{
                left: `${px}px`,
                top: `${py}px`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div style={{ transform: `rotate(${preRotate}deg)` }}>
                {sponsor.website ? (
                  <a
                    href={sponsor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={sponsor.name}
                    className="block"
                  >
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
