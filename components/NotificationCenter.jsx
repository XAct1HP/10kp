"use client";

import { useEffect, useMemo, useState } from "react";

const LAST_SEEN_KEY = "announcement_last_seen_at";

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(LAST_SEEN_KEY);
    if (saved) setLastSeenAt(saved);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnnouncements() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/announcements", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load updates.");
        }
        if (!cancelled) {
          setAnnouncements(data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load updates.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAnnouncements();
    const id = setInterval(fetchAnnouncements, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const newCount = useMemo(() => {
    if (!announcements.length) return 0;
    if (!lastSeenAt) return announcements.length;
    const last = new Date(lastSeenAt).getTime();
    return announcements.filter((a) => new Date(a.updated_at || a.created_at).getTime() > last)
      .length;
  }, [announcements, lastSeenAt]);

  useEffect(() => {
    if (!open) return;
    const now = new Date().toISOString();
    setLastSeenAt(now);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_SEEN_KEY, now);
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white hover:text-gray-300 transition-colors"
        aria-label="Open notification center"
      >
        <span className="text-base">🔔</span>
        <span className="hidden lg:inline">
          {newCount} New {newCount === 1 ? "Update" : "Updates"}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute top-20 right-0 h-[calc(100vh-5rem)] w-full sm:w-[420px] p-4"
            style={{
              background: "linear-gradient(160deg, rgba(11,26,59,0.95), rgba(6,14,33,0.95))",
              backdropFilter: "blur(18px)",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="h-full rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-maize font-semibold">
                    Notification Center
                  </p>
                  <h2 className="text-white font-semibold">Recent Announcements</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 text-white/40 hover:text-white/70 transition-colors"
                  aria-label="Close notification center"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loading ? (
                  <p className="text-sm text-white/40">Loading updates...</p>
                ) : error ? (
                  <p className="text-sm text-red-300">{error}</p>
                ) : announcements.length === 0 ? (
                  <p className="text-sm text-white/35">No announcements yet.</p>
                ) : (
                  announcements.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl p-3 border border-white/10 bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                        <span className="text-[10px] text-white/30 whitespace-nowrap">
                          {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-white/55 whitespace-pre-wrap leading-relaxed">
                        {item.content}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
