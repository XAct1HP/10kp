"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import PageBackground from "../../components/PageBackground";
import loginBg from "../../public/login-bg.png";

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setCheckingLink(false);
      } else if (session?.user && event === "SIGNED_IN") {
        setReady(true);
        setCheckingLink(false);
      }
    });

    const initialize = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const authError = params.get("error_description") || hashParams.get("error_description") || params.get("error");

        if (authError) {
          throw new Error(authError.replace(/\+/g, " "));
        }

        const code = params.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          setReady(true);
        } else {
          setError("This password reset link is invalid or has expired. Request a new one.");
        }
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "This password reset link is invalid or has expired.");
      } finally {
        if (mounted) setCheckingLink(false);
      }
    };

    initialize();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await updatePassword(password);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
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
            Choose a new password
          </h1>
          <p className="text-white/50 mt-2 text-sm">
            Reset the password for your 10KP account and then sign back in.
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

        {checkingLink ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-sm text-white/55">
              <svg className="animate-spin h-5 w-5 text-maize" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Validating reset link...
            </div>
          </div>
        ) : success ? (
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
                <h2 className="text-lg font-semibold text-white">Password updated</h2>
                <p className="text-sm text-white/60 mt-1">
                  Your password was changed successfully. Use it the next time you log in.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                type="button"
                onClick={() => router.push("/login?reset=success")}
                className="flex-1 inline-flex items-center justify-center py-3 text-sm font-semibold rounded-xl text-black"
                style={{ background: "#F2B517" }}
              >
                Go to log in
              </button>
              <Link
                href="/forgot-password"
                className="flex-1 inline-flex items-center justify-center py-3 text-sm font-semibold rounded-xl text-white/75 hover:text-white transition-colors"
                style={{ border: "2px solid rgba(255,255,255,0.12)" }}
              >
                Need another link?
              </Link>
            </div>
          </div>
        ) : ready ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-white/80 mb-2">
                New password
              </label>
              <div
                className="relative rounded-xl transition-all duration-200"
                style={{
                  border: focusedField === "password" ? "2px solid #F2B517" : "2px solid rgba(255,255,255,0.12)",
                  boxShadow: focusedField === "password" ? "0 0 0 3px rgba(242,181,23,0.2)" : "none",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 transition-colors" style={{ color: focusedField === "password" ? "#F2B517" : "rgba(255,255,255,0.35)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)" }}
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-white/80 mb-2">
                Confirm new password
              </label>
              <div
                className="relative rounded-xl transition-all duration-200"
                style={{
                  border: focusedField === "confirm" ? "2px solid #F2B517" : "2px solid rgba(255,255,255,0.12)",
                  boxShadow: focusedField === "confirm" ? "0 0 0 3px rgba(242,181,23,0.2)" : "none",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 transition-colors" style={{ color: focusedField === "confirm" ? "#F2B517" : "rgba(255,255,255,0.35)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setFocusedField("confirm")}
                  onBlur={() => setFocusedField(null)}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((value) => !value)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  tabIndex={-1}
                >
                  {showConfirm ? (
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

            <button
              type="submit"
              disabled={saving}
              className="relative w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none active:translate-y-0 active:shadow-md group"
              style={{ background: "#F2B517" }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Updating password...
                  </>
                ) : (
                  <>
                    Save new password
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </span>
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <Link
              href="/forgot-password"
              className="flex items-center justify-center w-full py-3.5 text-sm font-semibold rounded-xl text-black"
              style={{ background: "#F2B517" }}
            >
              Request a new reset link
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center w-full py-3.5 text-sm font-semibold rounded-xl text-white/80 transition-colors"
              style={{ border: "2px solid rgba(255,255,255,0.15)" }}
            >
              Back to log in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
