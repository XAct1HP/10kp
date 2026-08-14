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

const BOX = 280;             // visible container for the disk
const DISK = 480;            // disk diameter
const OFFSET = -240;         // pushes 3/4 of the disk offscreen (top-right)
const SLOT_RADIUS = 132;     // where logos sit on the disk (~0.55 × radius)
const RESTING_ANGLE = 225;   // 7:30 position in standard math coords

// Slot m sits at math angle (225 + m × 90)° on the disk, pre-rotated so it
// lands upright when the disk has spun m × 90° clockwise.
const SLOTS = Array.from({ length: SLOT_COUNT }, (_, m) => {
  const angleDeg = RESTING_ANGLE + m * (360 / SLOT_COUNT);
  const rad = (angleDeg * Math.PI) / 180;
  return {
    m,
    px: DISK / 2 + SLOT_RADIUS * Math.cos(rad),
    py: DISK / 2 - SLOT_RADIUS * Math.sin(rad),
    preRotate: -m * (360 / SLOT_COUNT),
  };
});

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

  return (
    <div
      // Desktop-only so it doesn't crowd the mobile hero.
      className="hidden lg:block absolute top-0 right-0 z-20 overflow-hidden pointer-events-none"
      style={{ width: `${BOX}px`, height: `${BOX}px` }}
    >
      {/* Disk (background + all 4 slots) rotates as one unit */}
      <div
        className="absolute"
        style={{
          width: `${DISK}px`,
          height: `${DISK}px`,
          top: `${OFFSET}px`,
          right: `${OFFSET}px`,
          transform: `rotate(${rotation}deg)`,
          transition: `transform ${SPIN_MS}ms cubic-bezier(0.65, 0.02, 0.32, 1)`,
          transformOrigin: "center",
          willChange: "transform",
        }}
      >
        {/* Blue disk face */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 68%, #1e3568 0%, #0B1A3B 55%, #050f24 100%)",
            boxShadow:
              "0 10px 40px rgba(0,0,0,0.45), inset -30px -30px 80px rgba(0,0,0,0.25), inset 20px 20px 60px rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />

        {/* Four slots. Each renders whichever sponsor it's currently assigned to. */}
        {SLOTS.map(({ m, px, py, preRotate }) => {
          const sponsor = sponsorForSlot(m, step, sponsors);
          if (!sponsor) return null;

          const content = sponsor.logo_url ? (
            <img
              src={sponsor.logo_url}
              alt={sponsor.name}
              className="max-h-14 max-w-[192px] w-auto object-contain"
              style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))" }}
            />
          ) : (
            <span
              className="text-sm font-semibold uppercase tracking-wide text-center px-3 whitespace-nowrap"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              {sponsor.name}
            </span>
          );

          const inner = (
            <div
              style={{
                width: "220px",
                height: "80px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
