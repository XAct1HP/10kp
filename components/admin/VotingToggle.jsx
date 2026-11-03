"use client";

import { useEffect, useState } from "react";

/**
 * VotingToggle — the master on/off switch for the public gallery ballot,
 * shown in the top row of the admin Votes tab. Backed by
 * competition_settings.voting_enabled.
 *
 * Off means the ballot is closed, not hidden: vote counts keep showing
 * everywhere in the gallery, the Vote button is replaced by a "Voting closed"
 * notice, and POST/DELETE /api/gallery/votes refuse — so the tally is frozen
 * server-side, which matters because the ballot is unauthenticated by design.
 */
export default function VotingToggle({ apiFetch, onError, onSuccess }) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/api/admin/competition-date");
        if (!cancelled) setEnabled(data?.voting_enabled !== false);
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
    const next = !enabled;
    setSaving(true);
    // Optimistic — snap the switch, roll back on error.
    setEnabled(next);
    try {
      await apiFetch("/api/admin/competition-date", {
        method: "POST",
        body: JSON.stringify({ voting_enabled: next }),
      });
      onSuccess?.(
        next
          ? "Voting is open — the gallery ballot is live."
          : "Voting is closed — counts still show, but no new votes can be cast."
      );
    } catch (err) {
      setEnabled(!next);
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg flex-shrink-0"
      style={{
        background: enabled ? "rgba(255,203,5,0.08)" : "rgba(248,113,113,0.10)",
        border: `1px solid ${enabled ? "rgba(255,203,5,0.20)" : "rgba(248,113,113,0.22)"}`,
      }}
      title="Turns the gallery ballot on or off. Vote counts stay visible either way."
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
        Voting
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Gallery voting"
        onClick={handleToggle}
        disabled={loading || saving}
        className="relative w-9 h-5 rounded-full transition-colors disabled:opacity-50"
        style={{ background: enabled ? "#FFCB05" : "rgba(255,255,255,0.15)" }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            background: enabled ? "#0B1A3B" : "#e5e5e5",
            transform: enabled ? "translateX(16px)" : "translateX(0)",
          }}
        />
      </button>
      <span
        className="text-[11px] font-bold w-6"
        style={{ color: enabled ? "#FFCB05" : "rgba(248,113,113,0.9)" }}
      >
        {loading ? "…" : enabled ? "On" : "Off"}
      </span>
    </div>
  );
}
