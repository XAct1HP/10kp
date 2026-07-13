"use client";

import Link from "next/link";
import Image from "next/image";

export default function VerifyEmailPage() {
  return (
    <div
      className="relative min-h-[calc(100vh-5rem)] flex items-center justify-end bg-cover bg-center"
      style={{ backgroundImage: "url('/login-bg.png')" }}
    >
      <div className="relative z-10 w-full max-w-md lg:mr-[8%] px-8 py-12 text-center">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Image
            src="/10kp_tspnt.png"
            alt="10KP Logo"
            width={270}
            height={90}
            className="w-auto h-[5.25rem] drop-shadow-lg"
            priority
          />
        </div>

        {/* Mail icon */}
        <div className="mb-6">
          <svg className="w-16 h-16 mx-auto" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        {/* Header */}
        <h1 className="text-3xl font-bold text-white tracking-tight mb-3">
          Check your inbox
        </h1>
        <p className="text-white/50 text-sm leading-relaxed mb-10">
          We sent a verification link to your <span className="text-white/70 font-medium">@umich.edu</span> email.
          Click the link to verify your account, then come back and log in.
        </p>

        {/* Go to Log In button */}
        <Link
          href="/login"
          className="relative inline-flex items-center justify-center w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden
            text-black hover:shadow-lg hover:-translate-y-0.5
            active:translate-y-0 active:shadow-md group"
          style={{ background: "#F2B517" }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            Go to Log In
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </span>
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </Link>
      </div>
    </div>
  );
}
