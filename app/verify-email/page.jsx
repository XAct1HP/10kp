"use client";

import Link from "next/link";
import AuthShell, { AuthHeader } from "../../components/AuthShell";

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <AuthHeader
        title="Check your inbox"
        subtitle="Confirm your email address by clicking the verification link we just sent."
      />

      {/* Mail icon */}
      <div className="mb-6 flex justify-center">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(255,203,5,0.12)",
            border: "1px solid rgba(255,203,5,0.3)",
          }}
        >
          <svg className="w-7 h-7" style={{ color: "#FFCB05" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      <p className="text-white/55 text-sm leading-relaxed mb-8 text-center">
        If you don&apos;t see the email within a few minutes, check your junk or
        spam folder.
      </p>

      {/* Go to Log In button */}
      <Link
        href="/login"
        className="relative flex items-center justify-center w-full py-3 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden
          text-black hover:shadow-lg hover:-translate-y-0.5
          active:translate-y-0 active:shadow-md group"
        style={{ background: "#FFCB05" }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          Go to Log In
          <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </span>
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </Link>
    </AuthShell>
  );
}
