"use client";

import { useEffect, useState } from "react";

function GlassCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: "rgba(11,26,59,0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * PodiumTogglePanel — single switch that shows or hides the Top 3 podium
 * at the top of the public gallery. Backed by
 * competition_settings.podium_visible; the gallery reads this via
 * /api/gallery/submissions.
 */
export default function PodiumTogglePanel({ apiFetch, onError, onSuccess }) {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/api/admin/competition-date");
        if (!cancelled) setVisible(data?.podium_visible !== false);
      } catch (err) {
        if (!cancelled) onError?.(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async () => {
    const next = !visible;
    setSaving(true);
    // Optimistic — snap the switch, roll back on error.
    setVisible(next);
    try {
      await apiFetch("/api/admin/competition-date", {
        method: "POST",
        body: JSON.stringify({ podium_visible: next }),
      });
      onSuccess?.(
        next ? "Podium is now visible in the gallery." : "Podium is hidden from the gallery."
      );
    } catch (err) {
      setVisible(!next);
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="#FFCB05" viewBox="0 0 24 24">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
            <h2 className="text-lg font-bold text-white">Gallery Podium</h2>
          </div>
          <p className="text-xs text-white/40 mt-0.5">
            Show the Top 3 podium at the top of the public gallery.
          </p>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer flex-shrink-0">
          <span className="text-xs text-white/60 whitespace-nowrap">
            {loading ? "…" : visible ? "On" : "Off"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            onClick={handleToggle}
            disabled={loading || saving}
            className="relative w-10 h-6 rounded-full transition-colors disabled:opacity-50"
            style={{
              background: visible ? "#FFCB05" : "rgba(255,255,255,0.15)",
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
              style={{
                background: visible ? "#0B1A3B" : "#e5e5e5",
                transform: visible ? "translateX(16px)" : "translateX(0)",
              }}
            />
          </button>
        </label>
      </div>
    </GlassCard>
  );
}
