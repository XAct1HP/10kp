"use client";

import { useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import Link from "next/link";
import Image from "next/image";
import PageBackground from "../../components/PageBackground";
import loginBg from "../../public/login-bg.png";

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: resetError } = await requestPasswordReset(email);
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSuccess(true);
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] flex items-center justify-end overflow-hidden">
      <PageBackground src={loginBg} priority quality={68} />
      <div className="relative z-10 w-full max-w-md lg:mr-[8%] px-8 py-12">
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

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Reset your password
          </h1>
          <p className="text-white/50 mt-2 text-sm">
            Enter the email tied to your 10KP account and we&apos;ll send you a reset link.
          </p>
        </div>

        {error && (
          <div
            className="mb-6 flex items-start gap-3 p-4 text-sm rounded-xl"
            style={{
              color: "#fca5a5",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(34, 197, 94, 0.08)",
              border: "1px solid rgba(34, 197, 94, 0.2)",
            }}
          >
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h2 className="text-lg font-semibold text-white">Check your inbox</h2>
                <p className="text-sm text-white/60 mt-1">
                  If that email has an account, Supabase just sent a password reset link. Open it on this site to choose a new password.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Link
                href="/login"
                className="flex-1 inline-flex items-center justify-center py-3 text-sm font-semibold rounded-xl text-black"
                style={{ background: "#F2B517" }}
              >
                Back to log in
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSuccess(false);
                  setEmail("");
                }}
                className="flex-1 py-3 text-sm font-semibold rounded-xl text-white/75 hover:text-white transition-colors"
                style={{ border: "2px solid rgba(255,255,255,0.12)" }}
              >
                Send another email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-white/80 mb-2">
                Email
              </label>
              <div
                className="relative rounded-xl transition-all duration-200"
                style={{
                  border: focusedField === "email" ? "2px solid #F2B517" : "2px solid rgba(255,255,255,0.12)",
                  boxShadow: focusedField === "email" ? "0 0 0 3px rgba(242,181,23,0.2)" : "none",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 transition-colors" style={{ color: focusedField === "email" ? "#F2B517" : "rgba(255,255,255,0.35)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="uniqname@umich.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none active:translate-y-0 active:shadow-md group"
              style={{ background: "#F2B517" }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending reset link...
                  </>
                ) : (
                  <>
                    Send reset link
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </span>
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </button>
          </form>
        )}

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }} />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="px-3 tracking-wider" style={{ color: "rgba(255,255,255,0.35)", background: "transparent" }}>Remembered it?</span>
          </div>
        </div>

        <Link
          href="/login"
          className="flex items-center justify-center w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 group"
          style={{
            border: "2px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.8)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#F2B517";
            e.currentTarget.style.color = "#F2B517";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
            e.currentTarget.style.color = "rgba(255,255,255,0.8)";
          }}
        >
          Back to log in
        </Link>
      </div>
    </div>
  );
}
