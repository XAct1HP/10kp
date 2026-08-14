"use client";

import { useEffect, useState } from "react";

/**
 * Rotates through sponsors one at a time in the top-right corner of the homepage.
 * Each sponsor holds for ~2.5s, then cross-fades to the next.
 * Sponsors are sourced from the admin Settings tab (Supabase `sponsors` table)
 * via GET /api/sponsors.
 */
const HOLD_MS = 2500;
const FADE_MS = 500;

export default function SponsorSpotlight() {
  const [sponsors, setSponsors] = useState(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

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

  useEffect(() => {
    if (!sponsors || sponsors.length <= 1) return; // nothing to rotate through
    const holdTimer = setTimeout(() => {
      setVisible(false);
      const swapTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % sponsors.length);
        setVisible(true);
      }, FADE_MS);
      // cleanup handled by outer effect return below
      return () => clearTimeout(swapTimer);
    }, HOLD_MS);
    return () => clearTimeout(holdTimer);
  }, [sponsors, index]);

  if (!sponsors || sponsors.length === 0) return null;

  const current = sponsors[index];

  const logo = current.logo_url ? (
    <img
      src={current.logo_url}
      alt={current.name}
      className="max-h-12 max-w-[160px] w-auto object-contain"
    />
  ) : (
    <span
      className="text-sm font-semibold uppercase tracking-wide text-right"
      style={{ color: "rgba(255,255,255,0.92)" }}
    >
      {current.name}
    </span>
  );

  const inner = (
    <div
      className="relative flex items-center justify-end"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      }}
    >
      {logo}
    </div>
  );

  return (
    <div
      // Desktop only — mobile hero is too tight to overlay a logo up top
      className="hidden lg:block absolute top-0 right-0 z-20 pointer-events-none"
    >
      {/* Minimal blue radial gradient — anchors the logo without competing with the hero */}
      <div
        aria-hidden
        className="absolute top-0 right-0"
        style={{
          width: "320px",
          height: "180px",
          background:
            "radial-gradient(ellipse at top right, rgba(11,26,59,0.55) 0%, rgba(11,26,59,0.25) 45%, transparent 78%)",
        }}
      />
      <div className="relative px-8 py-7 min-h-[80px] min-w-[180px] flex items-center justify-end pointer-events-auto">
        {current.website ? (
          <a
            href={current.website}
            target="_blank"
            rel="noopener noreferrer"
            title={current.name}
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
}
