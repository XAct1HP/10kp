"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";

// Permanent, shareable stand-in for a pitch file. The CSV export puts this URL
// in the "Pitch File Link" column. Opening it in a browser sends no auth header,
// so this thin client page reads the admin's Supabase session, asks the API for
// a freshly signed URL, and forwards the browser to it. Nothing here is
// reachable without an admin session — the API does the real authorization.
export default function AdminPitchFilePage({ params }) {
  const pitchId = params?.id;
  const [status, setStatus] = useState("resolving"); // resolving | denied | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            setStatus("denied");
            setMessage("Sign in with your admin account to open this file.");
          }
          return;
        }

        const res = await fetch(
          `/api/admin/pitches/file?id=${encodeURIComponent(pitchId)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.url) {
          setStatus(res.status === 401 || res.status === 403 ? "denied" : "error");
          setMessage(data.error || "Could not open this pitch file.");
          return;
        }

        window.location.replace(data.url);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(err.message || "Could not open this pitch file.");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [pitchId]);

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-6">
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{
          background: "rgba(11,26,59,0.55)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
      >
        {status === "resolving" ? (
          <>
            <div
              className="mx-auto mb-5 h-8 w-8 rounded-full animate-spin"
              style={{
                border: "3px solid rgba(255,255,255,0.15)",
                borderTopColor: "#FFCB05",
              }}
            />
            <p className="text-white/70 text-sm">Opening pitch file...</p>
          </>
        ) : (
          <>
            <h1 className="text-white text-lg font-semibold mb-2">
              {status === "denied" ? "Admin access required" : "Could not open file"}
            </h1>
            <p className="text-white/60 text-sm mb-6">{message}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {status === "denied" && (
                <Link
                  href="/login"
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "#FFCB05", color: "#0B1A3B" }}
                >
                  Sign in
                </Link>
              )}
              <Link
                href={`/gallery?pitch=${encodeURIComponent(pitchId || "")}`}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.15)" }}
              >
                View submission
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
