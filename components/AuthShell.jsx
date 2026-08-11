"use client";

import Image from "next/image";
import Link from "next/link";
import PageBackground from "./PageBackground";
import loginBg from "../public/login-bg.png";

/**
 * AuthShell — shared layout for /login, /signup, /verify-email,
 * /forgot-password, /reset-password.
 *
 * The login-bg image is composed of 3 photos on the left and a solid
 * navy (#00274C) panel occupying exactly the right 25% of the image.
 * This shell:
 *   • Pins the background image so its navy panel sits flush with the
 *     right edge of the viewport (objectPosition: "right center").
 *   • On desktop (lg+), overlays a solid #00274C column matching the
 *     image navy so the form always has a clean, predictable panel to
 *     live in regardless of viewport aspect ratio.
 *   • Centers the form contents inside that column.
 *   • On mobile, image fills the screen with a dark navy overlay for
 *     legibility and the form stacks in the middle.
 */
export default function AuthShell({ children }) {
  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden">
      <PageBackground
        src={loginBg}
        priority
        quality={68}
        objectPosition="right center"
      />

      {/* Mobile: darken the whole photo for legibility */}
      <div
        className="absolute inset-0 pointer-events-none lg:hidden"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,39,76,0.6) 0%, rgba(0,39,76,0.88) 55%, rgba(0,39,76,0.96) 100%)",
        }}
      />

      {/* Desktop: solid navy column pinned to the right, same color as
          the image's navy panel so any seam is invisible. */}
      <div
        className="hidden lg:block absolute top-0 right-0 h-full w-1/4 min-w-[340px] max-w-[520px]"
        style={{ background: "#00274C" }}
        aria-hidden="true"
      />

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
