"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/AuthContext";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import MuxPlayer from "@mux/mux-player-react";

// Helper to get the current user's access token for API calls
async function getToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

async function apiFetch(url, options = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── Countdown Timer ────────────────────────────────────────────────
function CountdownTimer({ targetDate }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!targetDate) return;

    const tick = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, past: true });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
        past: false,
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) {
    return (
      <p className="text-gray-500 text-lg">
        No competition date set yet.
      </p>
    );
  }

  if (!timeLeft) return null;

  const pad = (n) => String(n).padStart(2, "0");

  if (timeLeft.past) {
    return (
      <p className="text-red-600 text-lg font-semibold">
        Competition date has passed!
      </p>
    );
  }

  return (
    <div className="flex gap-2 sm:gap-4 text-center flex-wrap">
      {[
        { label: "Days", value: timeLeft.days },
        { label: "Hours", value: timeLeft.hours },
        { label: "Minutes", value: timeLeft.minutes },
        { label: "Seconds", value: timeLeft.seconds },
      ].map(({ label, value }) => (
        <div key={label} className="bg-gray-900 text-white rounded-lg px-3 sm:px-4 py-2 sm:py-3 min-w-[60px] sm:min-w-[72px]">
          <div className="text-xl sm:text-2xl font-mono font-bold">{pad(value)}</div>
          <div className="text-xs text-gray-400 mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────
export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [competitionDate, setCompetitionDate] = useState(null);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");

  const [pitches, setPitches] = useState([]);
  const [expandedPitch, setExpandedPitch] = useState(null);

  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState("");

  const [loadingState, setLoadingState] = useState({
    date: true,
    pitches: true,
    tags: true,
  });
  const [error, setError] = useState("");

  // Check admin access
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin =
    user && adminEmails.includes(user.email?.toLowerCase());

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/");
    }
  }, [authLoading, user, isAdmin, router]);

  // Fetch data
  const fetchDate = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/competition-date");
      setCompetitionDate(data.competition_date);
      if (data.competition_date) {
        // Pre-fill the edit input with the current date in local datetime format
        const d = new Date(data.competition_date);
        setDateInput(toLocalDatetimeString(d));
      }
    } catch {
      // No date set yet — that's fine
    } finally {
      setLoadingState((s) => ({ ...s, date: false }));
    }
  }, []);

  const fetchPitches = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/pitches");
      setPitches(data);
    } catch {
      // ignore
    } finally {
      setLoadingState((s) => ({ ...s, pitches: false }));
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/tags");
      setTags(data);
    } catch {
      // ignore
    } finally {
      setLoadingState((s) => ({ ...s, tags: false }));
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchDate();
      fetchPitches();
      fetchTags();
    }
  }, [user, isAdmin, fetchDate, fetchPitches, fetchTags]);

  // Handlers
  const handleSaveDate = async () => {
    setError("");
    if (!dateInput) return;
    try {
      const data = await apiFetch("/api/admin/competition-date", {
        method: "PUT",
        body: JSON.stringify({
          competition_date: new Date(dateInput).toISOString(),
        }),
      });
      setCompetitionDate(data.competition_date);
      setEditingDate(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    setError("");
    if (!newTagName.trim()) return;
    try {
      await apiFetch("/api/admin/tags", {
        method: "POST",
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      setNewTagName("");
      fetchTags();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteTag = async (id) => {
    setError("");
    try {
      await apiFetch(`/api/admin/tags?id=${id}`, { method: "DELETE" });
      fetchTags();
    } catch (err) {
      setError(err.message);
    }
  };

  // Loading / auth guard
  if (authLoading || !user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {/* ── Competition Countdown ──────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Competition Countdown
        </h2>

        {loadingState.date ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            <CountdownTimer targetDate={competitionDate} />

            {competitionDate && !editingDate && (
              <p className="text-sm text-gray-500 mt-3">
                Scheduled for{" "}
                {new Date(competitionDate).toLocaleString(undefined, {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </p>
            )}

            {editingDate ? (
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  type="datetime-local"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveDate}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingDate(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingDate(true)}
                className="mt-4 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {competitionDate ? "Edit Date" : "Set Date"}
              </button>
            )}
          </>
        )}
      </section>

      {/* ── All Pitches ───────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          All Pitches{" "}
          {!loadingState.pitches && (
            <span className="text-sm font-normal text-gray-500">
              ({pitches.length})
            </span>
          )}
        </h2>

        {loadingState.pitches ? (
          <p className="text-gray-500">Loading...</p>
        ) : pitches.length === 0 ? (
          <p className="text-gray-500">No pitches submitted yet.</p>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
                <tr>
                  <th className="py-3 pr-4">Submitter</th>
                  <th className="py-3 pr-4">Title</th>
                  <th className="py-3 pr-4">Tags</th>
                  <th className="py-3 pr-4">File</th>
                  <th className="py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pitches.map((pitch) => (
                  <tr
                    key={pitch.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      setExpandedPitch(
                        expandedPitch === pitch.id ? null : pitch.id
                      )
                    }
                  >
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {pitch.name}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{pitch.title}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {pitch.tags?.map((tag) => (
                          <span
                            key={tag.id}
                            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {(pitch.file_type || "file") === "video" ? (
                        <span className="inline-flex items-center gap-2">
                          <span>{pitch.file_name || "Video upload"}</span>
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
                            {pitch.mux_playback_id ? "ready" : pitch.mux_status || "pending"}
                          </span>
                        </span>
                      ) : (
                        pitch.file_name || "—"
                      )}
                    </td>
                    <td className="py-3 text-gray-500">
                      {new Date(pitch.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {pitches.map((pitch) => (
              <div
                key={pitch.id}
                className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() =>
                  setExpandedPitch(
                    expandedPitch === pitch.id ? null : pitch.id
                  )
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{pitch.name}</p>
                    <p className="text-sm text-gray-700">{pitch.title}</p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(pitch.created_at).toLocaleDateString()}
                  </span>
                </div>
                {pitch.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pitch.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {(pitch.file_type || "file") === "video" ? (
                    <span className="inline-flex items-center gap-1">
                      {pitch.file_name || "Video upload"}
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                        {pitch.mux_playback_id ? "ready" : pitch.mux_status || "pending"}
                      </span>
                    </span>
                  ) : (
                    pitch.file_name || "—"
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* Expanded pitch description */}
          {expandedPitch && (
            <div className="mt-2 p-4 bg-gray-50 rounded-md border border-gray-200">
              {(() => {
                const pitch = pitches.find((p) => p.id === expandedPitch);
                if (!pitch) return null;

                const isVideo = (pitch.file_type || "file") === "video";
                const canPlayVideo = Boolean(pitch.mux_playback_id);
                const videoMessage =
                  pitch.mux_error ||
                  `Video is ${pitch.mux_status || "processing"}...`;

                return (
                  <>
                    <p className="text-sm text-gray-500 mb-1 font-medium">Description</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4">
                      {pitch.description}
                    </p>

                    {isVideo && (
                      <>
                        <p className="text-sm text-gray-500 mb-2 font-medium">Video Preview</p>
                        {canPlayVideo ? (
                          <MuxPlayer
                            playbackId={pitch.mux_playback_id}
                            accentColor="#111827"
                            style={{ maxWidth: "720px", width: "100%" }}
                          />
                        ) : (
                          <p
                            className={`text-sm ${
                              pitch.mux_error ? "text-red-600" : "text-gray-600"
                            }`}
                          >
                            {videoMessage}
                          </p>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          </>
        )}
      </section>

      {/* ── Manage Tags ───────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Manage Tags
        </h2>

        {loadingState.tags ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            {/* Existing tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {tags.length === 0 ? (
                <p className="text-gray-500 text-sm">No tags created yet.</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm"
                  >
                    {tag.name}
                    <button
                      onClick={() => handleDeleteTag(tag.id)}
                      className="ml-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete tag"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add new tag */}
            <form onSubmit={handleCreateTag} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="New tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 transition-colors"
              >
                Add Tag
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

// Format a Date to "YYYY-MM-DDTHH:MM" for the datetime-local input
function toLocalDatetimeString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}
