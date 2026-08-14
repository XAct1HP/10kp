"use client";

import { useEffect, useState } from "react";

/**
 * Sponsor disk in the top-right corner of the homepage:
 * - A large navy disk sits in the top-right; only its bottom-left quadrant is visible
 *   (the container clips the rest).
 * - Logos take turns on the disk: each spins in, holds for 2s, then spins out before
 *   the next one spins in.
 * - Sponsors come from the admin Settings tab (Supabase `sponsors` table) via /api/sponsors.
 */
const IN_MS = 700;
const HOLD_MS = 2000;
const OUT_MS = 600;

// Container / disk sizing. Disk is ~1.7× the container so only its corner peeks in.
const BOX = 280; // container (visible viewport for the disk)
const DISK = 480; // disk diameter
const OFFSET = -240; // how far the disk sits outside the container (= -DISK/2 + BOX/2 - inset)

export default function SponsorSpotlight() {
  const [sponsors, setSponsors] = useState(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("in"); // "in" | "hold" | "out"

  // Load sponsors from the public endpoint (backed by admin settings)
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

  // Phase machine: in → hold → out → (next sponsor) → in ...
  useEffect(() => {
    if (!sponsors || sponsors.length === 0) return;
    let t;
    if (phase === "in") {
      t = setTimeout(() => setPhase("hold"), IN_MS);
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("out"), HOLD_MS);
    } else {
      t = setTimeout(() => {
        setIndex((i) => (i + 1) % sponsors.length);
        setPhase("in");
      }, OUT_MS);
    }
    return () => clearTimeout(t);
  }, [phase, sponsors]);

  if (!sponsors || sponsors.length === 0) return null;

  const current = sponsors[index];
  const animClass =
    phase === "in" ? "sponsor-spin-in" : phase === "out" ? "sponsor-spin-out" : "";

  const logo = current.logo_url ? (
    <img
      src={current.logo_url}
      alt={current.name}
      // 20% larger than the previous spotlight (h-12 → h-14, 160px → 192px)
      className="max-h-14 max-w-[192px] w-auto object-contain"
      style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))" }}
    />
  ) : (
    <span
      className="text-sm font-semibold uppercase tracking-wide text-center px-3"
      style={{ color: "rgba(255,255,255,0.95)" }}
    >
      {current.name}
    </span>
  );

  const logoWrapper = (
    <div
      // key restarts the CSS animation cleanly each time phase changes
      key={`${index}-${phase}`}
      className={animClass}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "220px",
        maxWidth: "100%",
      }}
    >
      {logo}
    </div>
  );

  return (
    <div
      // Desktop only — mobile hero is too tight for a large corner disk
      className="hidden lg:block absolute top-0 right-0 z-20 overflow-hidden pointer-events-none"
      style={{ width: `${BOX}px`, height: `${BOX}px` }}
    >
      {/* The blue disk — only its bottom-left quadrant lands in the visible container */}
      <div
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: `${DISK}px`,
          height: `${DISK}px`,
          top: `${OFFSET}px`,
          right: `${OFFSET}px`,
          background:
            "radial-gradient(circle at 32% 68%, #1e3568 0%, #0B1A3B 55%, #050f24 100%)",
          boxShadow:
            "0 10px 40px rgba(0,0,0,0.45), inset -30px -30px 80px rgba(0,0,0,0.25), inset 20px 20px 60px rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />

      {/* Logo layer — positioned inside the disk's visible quadrant */}
      <div
        className="absolute pointer-events-auto"
        style={{
          left: "56%",
          top: "44%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {current.website ? (
          <a
            href={current.website}
            target="_blank"
            rel="noopener noreferrer"
            title={current.name}
            className="block"
          >
            {logoWrapper}
          </a>
        ) : (
          logoWrapper
        )}
      </div>
    </div>
  );
}
