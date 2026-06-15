"use client";

import { useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await signIn(email, password);
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
    } else {
      const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (adminEmails.includes(email.toLowerCase())) {
        router.push("/admin");
      } else {
        router.push("/intake");
      }
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* ───── Left brand panel (desktop only) ───── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80')",
          }}
        />
        {/* Navy + maize overlay blend */}
        <div className="absolute inset-0 bg-navy/85" />
        <div className="absolute inset-0 bg-gradient-to-br from-maize/20 via-transparent to-maize/10" />

        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-maize/15 blur-3xl animate-pulse" />
          <div
            className="absolute bottom-12 right-12 w-72 h-72 rounded-full bg-maize/10 blur-2xl"
            style={{ animation: "pulse 4s ease-in-out infinite 1s" }}
          />
          <div
            className="absolute top-1/2 left-1/3 w-56 h-56 rounded-full bg-white/5 blur-2xl"
            style={{ animation: "pulse 5s ease-in-out infinite 2s" }}
          />
        </div>

        {/* Diagonal decorative lines */}
        <div className="absolute inset-0 opacity-[0.06]">
          <div className="absolute top-0 left-0 w-full h-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, white 0px, white 1px, transparent 1px, transparent 60px)",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 px-12 max-w-lg text-center">
          <div className="mb-8 flex justify-center">
            <Image
              src="/10kp_logo_enhanced.png"
              alt="10KP Logo"
              width={280}
              height={93}
              className="w-auto h-24 drop-shadow-2xl"
              priority
            />
          </div>

          <div className="w-16 h-0.5 bg-maize mx-auto mb-8 rounded-full" />

          <p className="text-white/80 text-lg leading-relaxed font-light">
            Where bold ideas meet the stage.
            <br />
            <span className="text-maize font-medium">Pitch. Compete. Launch.</span>
          </p>

          {/* Floating stat cards */}
          <div className="mt-12 flex gap-4 justify-center">
            {[
              { value: "10K", label: "Prize Pool" },
              { value: "60s", label: "To Pitch" },
              { value: "1", label: "Big Idea" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-xl px-5 py-4 text-center transition-transform hover:scale-105"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="text-maize text-2xl font-bold">{stat.value}</div>
                <div className="text-white/60 text-xs mt-1 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom corner accent */}
        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r from-maize via-maize/70 to-maize/20" />
      </div>

      {/* ───── Right form panel ───── */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 bg-gray-50 lg:rounded-l-[2.5rem] relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Image
              src="/10kp_logo_enhanced.png"
              alt="10KP Logo"
              width={160}
              height={53}
              className="w-auto h-14"
              priority
            />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-navy tracking-tight">
              Welcome back
            </h1>
            <p className="text-gray-500 mt-2">
              Sign in to your 10KP account
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 flex items-start gap-3 p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-navy mb-2">
                Email
              </label>
              <div className={`relative rounded-xl border-2 transition-all duration-200 ${
                focusedField === "email"
                  ? "border-maize shadow-[0_0_0_3px_rgba(242,181,23,0.15)]"
                  : "border-gray-200 hover:border-gray-300"
              }`}>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className={`w-5 h-5 transition-colors ${focusedField === "email" ? "text-maize" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  className="w-full pl-12 pr-4 py-3.5 bg-transparent rounded-xl text-sm text-navy placeholder-gray-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-navy mb-2">
                Password
              </label>
              <div className={`relative rounded-xl border-2 transition-all duration-200 ${
                focusedField === "password"
                  ? "border-maize shadow-[0_0_0_3px_rgba(242,181,23,0.15)]"
                  : "border-gray-200 hover:border-gray-300"
              }`}>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className={`w-5 h-5 transition-colors ${focusedField === "password" ? "text-maize" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-transparent rounded-xl text-sm text-navy placeholder-gray-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-navy transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden
                bg-navy text-white hover:shadow-lg hover:shadow-navy/25 hover:-translate-y-0.5
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none
                active:translate-y-0 active:shadow-md group"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    Log In
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </span>
              {/* Hover shimmer */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-gray-50 px-3 text-gray-400 tracking-wider">New here?</span>
            </div>
          </div>

          {/* Sign up link */}
          <Link
            href="/signup"
            className="flex items-center justify-center w-full py-3.5 text-sm font-semibold rounded-xl
              border-2 border-maize text-navy
              hover:bg-maize hover:text-black
              transition-all duration-200 group"
          >
            Create an account
            <svg className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
