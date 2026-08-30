"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import PageBackground from "./PageBackground";
import loginBg from "../public/login-bg.png";

// The photo composite only reads correctly at desktop aspect ratios: on a
// phone the object-cover crop lops off most of it. Mobile gets the solid
// navy instead, and because the file is ~1.8MB the image is not rendered at
// all there rather than hidden with CSS (a hidden <Image> still downloads).
// State starts at "mobile" so a phone never begins the fetch; desktop
// corrects on mount, over a navy ground that matches the panel, so the
// hand-off is invisible.
const DESKTOP_QUERY = "(min-width: 1024px)";
// Matches the navy panel baked into the right quarter of the photo.
const PANEL_NAVY = "#00274C";
// Matches the navbar and page body, so the mobile page reads as one field
// of color from the top of the screen down.
const PAGE_NAVY = "#0B1A3B";

/**
 * AuthShell — shared layout for /login, /signup, /verify-email,
 * /forgot-password, /reset-password.
 *
 * The login-bg image is composed of 3 photos on the left and a solid
 * navy (#00274C) panel occupying exactly the right 25% of the image.
 * This shell:
 *   • On desktop (lg+), pins the background image so its navy panel sits
 *     flush with the right edge of the viewport, and overlays a solid
 *     #00274C column matching the image navy so the form always has a
 *     clean, predictable panel to live in regardless of aspect ratio.
 *   • On mobile, drops the photo entirely and runs the form on the same
 *     flat navy as the navbar and page body.
 */
export default function AuthShell({ children }) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return (
    <div
      className="relative min-h-[calc(100vh-5rem)] overflow-hidden"
      style={{ background: PAGE_NAVY }}
    >
      {isDesktop && (
        <>
          <PageBackground
            src={loginBg}
            priority
            quality={68}
            objectPosition="right center"
          />

          {/* Solid navy column pinned to the right, same color as the
              image's navy panel so any seam is invisible. */}
          <div
            className="absolute top-0 right-0 h-full w-1/4 min-w-[340px] max-w-[520px]"
            style={{ background: PANEL_NAVY }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Form column */}
      <div className="relative z-10 min-h-[calc(100vh-5rem)] flex items-center justify-center lg:justify-end">
        <div
          className="w-full max-w-sm px-6 py-8
                     lg:w-1/4 lg:min-w-[340px] lg:max-w-[520px]
                     lg:px-8 lg:py-10"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * AuthHeader — logo + heading + optional subtitle used across auth pages.
 * Sized to fit comfortably inside the ~340–520px shell column.
 */
export function AuthHeader({ title, subtitle }) {
  return (
    <>
      <div className="flex justify-center mb-8">
        <Link href="/" aria-label="10KP home">
          <Image
            src="/10kp_tspnt.png"
            alt="10KP Logo"
            width={220}
            height={73}
            className="w-auto h-16 drop-shadow-lg"
            priority
          />
        </Link>
      </div>
      <div className="mb-7 text-center">
        <h1 className="text-2xl sm:text-[1.65rem] font-bold text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-white/55 mt-2 text-sm leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </>
  );
}
