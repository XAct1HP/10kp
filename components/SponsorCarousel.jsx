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
      className="max-h-8 sm:max-h-10 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-200"
      loading="lazy"
    />
  ) : (
    <span
      className="text-[10px] sm:text-xs font-semibold tracking-wide uppercase whitespace-nowrap opacity-70"
      style={{ color: "rgba(255,255,255,0.85)" }}
    >
      {name}
    </span>
  );

  const wrapperClass = "flex items-center justify-center h-full px-4 sm:px-6 shrink-0";

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

  // Duplicate the list so the marquee loops seamlessly.
  const loop = [...sponsors, ...sponsors];

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center h-12 sm:h-14">
          <span
            className="hidden sm:block text-[10px] uppercase tracking-[0.28em] font-semibold pl-6 pr-4 shrink-0"
            style={{ color: "rgba(255,203,5,0.75)" }}
          >
            Presented by
          </span>
          <div className="flex-1 overflow-hidden">
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
      </div>
    </div>
  );
}
