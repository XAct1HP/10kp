"use client";

import { useEffect, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";

const PAGE_SIZE = 8;

export default function GalleryPage() {
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: false,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSubmissions() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(
          `/api/gallery/submissions?page=${page}&pageSize=${PAGE_SIZE}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load submissions.");
        }

        if (cancelled) return;

        setSubmissions(data.submissions || []);
        setPagination(
          data.pagination || {
            page,
            pageSize: PAGE_SIZE,
            total: 0,
            hasMore: false,
          }
        );
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load submissions.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSubmissions();

    return () => {
      cancelled = true;
    };
  }, [page]);

  const totalPages = Math.max(
    1,
    Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE))
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Submission Gallery</h1>
      <p className="text-sm text-gray-500 mb-4">
        Browse and preview submissions from all participants.
      </p>

      {!loading && !error && pagination.total > 0 && (
        <p className="text-sm text-gray-500 mb-8">
          Showing page {pagination.page} of {totalPages} ({pagination.total} total
          submissions)
        </p>
      )}

      {loading && <p className="text-gray-500">Loading submissions...</p>}

      {error && (
        <div className="mb-6 p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {!loading && !error && submissions.length === 0 && (
        <p className="text-gray-500">No submissions available yet.</p>
      )}

      {!loading && !error && submissions.length > 0 && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {submissions.map((pitch) => {
              const isVideo = (pitch.file_type || "file") === "video";
              const canPlayVideo = Boolean(pitch.mux_playback_id);
              const videoMessage =
                pitch.mux_error || `Video is ${pitch.mux_status || "processing"}...`;

              return (
                <article
                  key={pitch.id}
                  className="bg-white border border-gray-200 rounded-lg p-5 space-y-4"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{pitch.title}</h2>
                    <p className="text-sm text-gray-500">By {pitch.name}</p>
                  </div>

                  {pitch.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pitch.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {pitch.description}
                  </p>

                  {isVideo ? (
                    canPlayVideo ? (
                      <>
                        <img
                          src={`https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1`}
                          alt={`${pitch.title} video thumbnail`}
                          className="w-full aspect-video object-cover rounded-md border border-gray-200"
                        />
                        <MuxPlayer
                          playbackId={pitch.mux_playback_id}
                          accentColor="#111827"
                          style={{ width: "100%" }}
                        />
                      </>
                    ) : (
                      <p
                        className={`text-sm ${
                          pitch.mux_error ? "text-red-600" : "text-gray-500"
                        }`}
                      >
                        {videoMessage}
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-gray-500">
                      Attached file: {pitch.file_name || "No file name available"}
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={page === 1 || loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <p className="text-sm text-gray-500">
              Page {pagination.page} of {totalPages}
            </p>

            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!pagination.hasMore || loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
