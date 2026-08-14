"use client";

import { useEffect, useState } from "react";

/**
 * Sponsor list comes from the admin Settings tab (Supabase `sponsors` table).
 * Logos are uploaded to Supabase Storage and served via `logo_url`.
 * If a sponsor has no logo, we render its name as a text fallback.
 */
function LogoTile({ name, website, logo_url }) {
  const content = logo_url ? (
    <img
      src={logo_url}
      alt={name}
      className="max-h-10 sm:max-h-12 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity duration-200"
      loading="lazy"
    />
  ) : (
    <span
      className="text-xs sm:text-sm font-semibold tracking-wide uppercase whitespace-nowrap opacity-80"
      style={{ color: "rgba(255,255,255,0.9)" }}
    >
      {name}
    </span>
  );

  const wrapperClass = "flex items-center justify-center h-full px-6 sm:px-8 shrink-0";

  if (website) {
    return (
      <a
        href={website}
        target="_blank"
        rel="noopener noreferrer"
        className={wrapperClass}
        title={name}
      >
        {content}
      </a>
    );
  }
  return <div className={wrapperClass}>{content}</div>;
}

export default function SponsorCarousel() {
  const [sponsors, setSponsors] = useState(null);

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

  // Hide the strip entirely while loading or when there are no sponsors —
  // avoids an empty bar flashing on the homepage.
  if (!sponsors || sponsors.length === 0) return null;

  // Build ONE cycle repeated enough times to comfortably exceed the viewport
  // width, then duplicate that cycle so the marquee loops seamlessly.
  // - 1 sponsor  → cycle is [A, A, A, A, A, A, A, A]      → shows A A A ... continuously
  // - 2 sponsors → cycle is [A, B, A, B, A, B, A, B]      → alternates A B A B ...
  // - 3 sponsors → cycle is [A, B, C, A, B, C, A, B, C]   → 1,2,3,1,2,3 ...
  // - 8+         → cycle is the sponsors themselves once
  const repeats = Math.max(1, Math.ceil(8 / sponsors.length));
  const cycle = Array.from({ length: repeats }, () => sponsors).flat();
  const loop = [...cycle, ...cycle];

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0, black 6%, black 94%, transparent 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0, black 6%, black 94%, transparent 100%)",
      }}
    >
      <div className="flex items-center h-12 sm:h-14">
        <div
          className="flex items-center marquee-track"
          style={{ width: "max-content" }}
        >
          {loop.map((sponsor, i) => (
            <LogoTile key={`${sponsor.id}-${i}`} {...sponsor} />
          ))}
        </div>
      </div>
    </div>
  );
}
