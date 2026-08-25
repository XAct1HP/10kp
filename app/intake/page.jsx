"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import Image from "next/image";
import Link from "next/link";
import ProtectedRoute from "../../components/ProtectedRoute";

// Scrollable pane with the scrollbar hidden and a bottom fade that only
// appears while there is more to scroll to. Mirrors the admin page's
// ScrollPane — with no scrollbar to look at, the fade is the only cue that
// the list continues.
function ScrollPane({ children, className = "", wrapperClassName = "", style, fadeHeight = 28 }) {
  const scrollRef = useRef(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setShowFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });

    // Watch the pane and its content: the pane is sized in viewport units, and
    // tags / awards arrive from the network after the first paint.
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className={`relative ${wrapperClassName}`}>
      <div ref={scrollRef} className={`overflow-y-auto no-scrollbar ${className}`} style={style}>
        {children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 transition-opacity duration-200"
        style={{
          height: fadeHeight,
          background: "linear-gradient(to bottom, rgba(11,26,59,0) 0%, rgba(11,26,59,0.85) 100%)",
          opacity: showFade ? 1 : 0,
        }}
      />
    </div>
  );
}

const ACCEPTED_FILE_TYPES = [
  // Text/Document
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/webm",
];

const TEXT_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];
const VIDEO_FILE_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const AUDIO_FILE_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/webm"];
const IMAGE_FILE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;
const CONTENT_FADE_OUT_MS = 300;
const CONTENT_FADE_IN_MS = 400;
const BACKGROUND_FADE_MS = 700;
const BACKGROUND_PRELOAD_LOOKAHEAD = 2;

const ROLE_OPTIONS = [
  "Current student",
  "Current staff or faculty",
  "Alumni",
];

const STUDENT_LEVEL_OPTIONS = [
  "Undergraduate",
  "Graduate",
  "PhD",
];

const UM_SCHOOLS = [
  "Architecture & Urban Planning",
  "Art & Design",
  "Business",
  "Dentistry",
  "Education",
  "Engineering",
  "Environment and Sustainability",
  "Information",
  "Kinesiology",
  "Law",
  "Literature, Science, and the Arts",
  "Medicine",
  "Music, Theatre & Dance",
  "Nursing",
  "Pharmacy",
  "Public Health",
  "Public Policy",
  "Rackham Graduate School",
  "Social Work",
];

const FLOOR_IMAGES = [
  "/elevator-webp/pitch_no_floor.webp",
  "/elevator-webp/pitch_floor1.webp",
  "/elevator-webp/pitch_floor2.webp",
  "/elevator-webp/pitch_floor3.webp",
  "/elevator-webp/pitch_floor4.webp",
  "/elevator-webp/pitch_floor5.webp",
  "/elevator-webp/pitch_floor6.webp",
  "/elevator-webp/pitch_floor7.webp",
];

const FLOOR_LABELS = [
  "Lobby",
  "Your Info",
  "School(s)",
  "Pitch Details",
  "Tags & Awards",
  "Pitch File",
  "Review",
  "Submit",
];

export default function IntakePage() {
  const { user } = useAuth();
  const isMountedRef = useRef(true);
  const timeoutIdsRef = useRef([]);
  const backgroundLayerKeyRef = useRef(1);
  const bgIndexRef = useRef(0);
  const loadedBackgroundIndexesRef = useRef(new Set([0]));
  const backgroundPreloadPromisesRef = useRef(new Map());

  const [name, setName] = useState("");
  const [uniqname, setUniqname] = useState("");
  // Teammate uniqnames. Each "Add Teammate" click appends a blank field.
  const [teammateUniqnames, setTeammateUniqnames] = useState([]);
  const [pitchTitle, setPitchTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  // Award tracks the submitter is asking to be judged for. Selecting one is
  // a request, not a guarantee — after the pitch clears moderation its
  // content is scored against each award's criteria, and tracks it doesn't
  // fit are dropped. The auto-entry raffle is excluded here; every approved
  // pitch is in it already.
  const [selectedAwards, setSelectedAwards] = useState([]);
  const [availableAwards, setAvailableAwards] = useState([]);
  const [raffleAward, setRaffleAward] = useState(null);
  const [role, setRole] = useState("");
  const [studentLevel, setStudentLevel] = useState("");
  const [schools, setSchools] = useState([]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedVideoUpload, setSubmittedVideoUpload] = useState(false);

  // New: text pitch mode
  const [pitchMode, setPitchMode] = useState("file"); // "file" or "text"
  const [textContent, setTextContent] = useState("");

  // New: optional thumbnail upload
  const [thumbnail, setThumbnail] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState(null);

  const [floor, setFloor] = useState(0);
  const [bgIndex, setBgIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [preparingFloor, setPreparingFloor] = useState(null);
  const [backgroundLayers, setBackgroundLayers] = useState([
    { key: 0, index: 0, state: "active" },
  ]);

  const [competitionDescription, setCompetitionDescription] = useState("");

  // Uniqnames are the part of a U-M address before the @. Accept a pasted
  // full email and reduce it, since that is the most common mistake.
  const normalizeUniqname = (value) =>
    String(value || "").trim().toLowerCase().split("@")[0].replace(/\s+/g, "");

  const isValidUniqname = (value) => /^[a-z0-9-]{2,32}$/.test(value);

  // Prefill the submitter's own uniqname from the @umich.edu account they
  // signed in with. Only fills a blank field so a manual edit is never
  // clobbered by a re-render.
  useEffect(() => {
    const derived = normalizeUniqname(user?.email);
    if (derived && isValidUniqname(derived)) {
      setUniqname((prev) => (prev ? prev : derived));
    }
  }, [user?.email]);

  // Postgres undefined_column, or a PostgREST schema-cache miss, when the
  // uniqname migration has not been applied to this environment yet.
  const isMissingColumnError = (error) =>
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column .* does not exist/i.test(error?.message || "") ||
    /Could not find the '.*' column of '.*' in the schema cache/i.test(error?.message || "");

  const addTeammate = () => setTeammateUniqnames((prev) => [...prev, ""]);

  const updateTeammate = (index, value) =>
    setTeammateUniqnames((prev) =>
      prev.map((entry, i) => (i === index ? value : entry))
    );

  const removeTeammate = (index) =>
    setTeammateUniqnames((prev) => prev.filter((_, i) => i !== index));

  // Cleaned, de-duplicated teammate list — what gets validated, reviewed and
  // saved. Blank rows are dropped, and the submitter's own uniqname is
  // filtered out so they never appear as their own teammate.
  const cleanedTeammates = () => {
    const seen = new Set();
    const own = normalizeUniqname(uniqname);
    const result = [];
    for (const entry of teammateUniqnames) {
      const cleaned = normalizeUniqname(entry);
      if (!cleaned || cleaned === own || seen.has(cleaned)) continue;
      seen.add(cleaned);
      result.push(cleaned);
    }
    return result;
  };

  const preloadBackground = (index) => {
    if (index < 0 || index >= FLOOR_IMAGES.length) {
      return Promise.resolve();
    }
    if (loadedBackgroundIndexesRef.current.has(index)) {
      return Promise.resolve();
    }
    const existingPromise = backgroundPreloadPromisesRef.current.get(index);
    if (existingPromise) {
      return existingPromise;
    }

    const src = FLOOR_IMAGES[index];
    const preloadPromise = new Promise((resolve) => {
      const img = new window.Image();
      img.decoding = "async";

      const markReady = () => {
        loadedBackgroundIndexesRef.current.add(index);
        backgroundPreloadPromisesRef.current.delete(index);
        resolve();
      };

      const decodeIfPossible = () => {
        if (typeof img.decode === "function") {
          img.decode().catch(() => {}).finally(markReady);
          return;
        }
        markReady();
      };

      img.onload = decodeIfPossible;
      img.onerror = () => {
        backgroundPreloadPromisesRef.current.delete(index);
        resolve();
      };
      img.src = src;

      if (img.complete && img.naturalWidth > 0) {
        decodeIfPossible();
      }
    });

    backgroundPreloadPromisesRef.current.set(index, preloadPromise);
    return preloadPromise;
  };

  useEffect(() => {
    bgIndexRef.current = bgIndex;
    const preloadIndexes = new Set([bgIndex]);
    for (let offset = 1; offset <= BACKGROUND_PRELOAD_LOOKAHEAD; offset += 1) {
      const nextIndex = bgIndex + offset;
      if (nextIndex < FLOOR_IMAGES.length) {
        preloadIndexes.add(nextIndex);
      }
    }
    if (bgIndex > 0) {
      preloadIndexes.add(bgIndex - 1);
    }

    preloadIndexes.forEach((index) => {
      void preloadBackground(index);
    });
  }, [bgIndex]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIdsRef.current = [];
    };
  }, []);

  const runAfterDelay = (callback, delay) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
      callback();
    }, delay);
    timeoutIdsRef.current.push(timeoutId);
  };

  useEffect(() => {
    async function fetchTags() {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");
      if (!error && data) setAvailableTags(data);
    }
    fetchTags();
  }, []);

  useEffect(() => {
    async function fetchAwards() {
      try {
        const res = await fetch("/api/awards");
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;
        setAvailableAwards(data.filter((a) => !a.is_raffle));
        setRaffleAward(data.find((a) => a.is_raffle) || null);
      } catch {
        // Award tracks are optional — a failure here must not block a
        // submission. The picker simply doesn't render.
      }
    }
    fetchAwards();
  }, []);

  useEffect(() => {
    async function fetchDescription() {
      try {
        const res = await fetch("/api/admin/competition-date");
        const data = await res.json();
        if (data.competition_description) {
          setCompetitionDescription(data.competition_description);
        }
      } catch {
        // ignore
      }
    }
    fetchDescription();
  }, []);

  const goToFloor = async (newFloor) => {
    if (newFloor === floor || transitioning || preparingFloor !== null) return;
    setPreparingFloor(newFloor);
    await preloadBackground(newFloor);
    if (!isMountedRef.current) return;

    setPreparingFloor(null);
    setTransitioning(true);
    const currentBgIndex = bgIndexRef.current;

    runAfterDelay(() => {
      const incomingLayer = {
        key: backgroundLayerKeyRef.current,
        index: newFloor,
        state: "active",
      };
      backgroundLayerKeyRef.current += 1;

      const nextLayers = currentBgIndex === newFloor
        ? [incomingLayer]
        : [
            {
              key: backgroundLayerKeyRef.current,
              index: currentBgIndex,
              state: "outgoing",
            },
            incomingLayer,
          ];

      if (currentBgIndex !== newFloor) {
        backgroundLayerKeyRef.current += 1;
      }

      setBackgroundLayers(nextLayers);
      setBgIndex(newFloor);
      setFloor(newFloor);
      runAfterDelay(() => {
        setBackgroundLayers([incomingLayer]);
      }, BACKGROUND_FADE_MS);
      runAfterDelay(() => setTransitioning(false), CONTENT_FADE_IN_MS);
    }, CONTENT_FADE_OUT_MS);
    setError("");
  };

  const nextFloor = () => {
    if (floor === 0) { goToFloor(1); return; }
    const err = validateFloor(floor);
    if (err) { setError(err); return; }
    goToFloor(floor + 1);
  };

  const prevFloor = () => {
    if (floor > 0) goToFloor(floor - 1);
  };

  const validateFloor = (f) => {
    switch (f) {
      case 1:
        if (!name.trim()) return "Please enter your name.";
        if (!normalizeUniqname(uniqname)) return "Please enter your uniqname.";
        if (!isValidUniqname(normalizeUniqname(uniqname))) {
          return "That uniqname does not look right — enter just the part of your U-M email before @umich.edu.";
        }
        for (const entry of teammateUniqnames) {
          const cleaned = normalizeUniqname(entry);
          if (entry.trim() && !isValidUniqname(cleaned)) {
            return `"${entry.trim()}" is not a valid uniqname — enter just the part before @umich.edu.`;
          }
        }
        if (!role) return "Please select your role.";
        if (role === "Current student" && !studentLevel) return "Please select your student level.";
        return null;
      case 3:
        if (!pitchTitle.trim()) return "Please enter a pitch title.";
        if (!description.trim()) return "Please enter a description.";
        return null;
      case 5:
        if (pitchMode === "file" && !file) return "Please upload a pitch file.";
        if (pitchMode === "text" && !textContent.trim()) return "Please enter your pitch text.";
        return null;
      default:
        return null;
    }
  };

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const toggleAward = (awardId) => {
    setSelectedAwards((prev) =>
      prev.includes(awardId) ? prev.filter((id) => id !== awardId) : [...prev, awardId]
    );
  };

  const toggleSchool = (school) => {
    setSchools((prev) =>
      prev.includes(school) ? prev.filter((s) => s !== school) : [...prev, school]
    );
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError("File must be under 500MB.");
      setFile(null);
      return;
    }
    if (!ACCEPTED_FILE_TYPES.includes(selected.type)) {
      setError("Unsupported file type. Please upload a video (MP4, MOV, WebM), audio (MP3, WAV, OGG, AAC, M4A), or text document (PDF, DOCX, TXT).");
      setFile(null);
      return;
    }
    setError("");
    setFile(selected);
  };

  const handleThumbnailChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (selected.size > MAX_THUMBNAIL_SIZE) {
      setError("Thumbnail must be under 5MB.");
      return;
    }
    if (!IMAGE_FILE_TYPES.includes(selected.type)) {
      setError("Thumbnail must be an image file (PNG, JPG, GIF, or WebP).");
      return;
    }
    setError("");
    setThumbnail(selected);
    // Create preview
    const reader = new FileReader();
    reader.onload = (ev) => setThumbnailPreview(ev.target.result);
    reader.readAsDataURL(selected);
  };

  const removeThumbnail = () => {
    setThumbnail(null);
    setThumbnailPreview(null);
  };

  // Determine actual file type category
  const getFileCategory = () => {
    if (!file) {
      if (pitchMode === "text") return "text";
      return null;
    }
    if (VIDEO_FILE_TYPES.includes(file.type)) return "video";
    if (AUDIO_FILE_TYPES.includes(file.type)) return "audio";
    if (TEXT_FILE_TYPES.includes(file.type)) return "text";
    return "file";
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    const isVideoUpload = file && VIDEO_FILE_TYPES.includes(file.type);
    const isAudioUpload = file && AUDIO_FILE_TYPES.includes(file.type);
    // Audio pitches also go through Mux — Mux generates the captions the
    // moderation pipeline uses as a transcript.
    const isMuxUpload = isVideoUpload || isAudioUpload;
    const isTextOnly = pitchMode === "text" && !file;
    let createdPitchId = null;

    try {
      const basePitchRow = {
        user_id: user.id,
        name: name.trim(),
        role,
        student_level: role === "Current student" ? studentLevel : null,
        schools,
        title: pitchTitle.trim(),
        description: description.trim(),
        file_type: isVideoUpload ? "video" : isAudioUpload ? "audio" : "file",
        file_name: file ? file.name : (isTextOnly ? "Text Submission" : null),
        text_content: pitchMode === "text" ? textContent.trim() || null : null,
        mux_status: isMuxUpload ? "pending" : null,
        mux_error: null,
      };

      let { data: pitch, error: pitchError } = await supabase
        .from("pitches")
        .insert({
          ...basePitchRow,
          uniqname: normalizeUniqname(uniqname) || null,
          teammate_uniqnames: cleanedTeammates(),
        })
        .select()
        .single();

      // uniqname / teammate_uniqnames arrive with
      // migrations/20260824_add_uniqnames_to_pitches.sql. If this deploy is
      // ahead of the database, fall back to the columns that do exist rather
      // than failing the submission outright — losing a uniqname is recoverable,
      // losing a pitch is not.
      if (pitchError && isMissingColumnError(pitchError)) {
        console.warn("Uniqname columns missing — run the 20260824 migration.");
        ({ data: pitch, error: pitchError } = await supabase
          .from("pitches")
          .insert(basePitchRow)
          .select()
          .single());
      }

      if (pitchError) throw pitchError;
      createdPitchId = pitch.id;

      if (selectedTags.length > 0) {
        const tagRows = selectedTags.map((tagId) => ({
          pitch_id: pitch.id,
          tag_id: tagId,
        }));
        const { error: tagError } = await supabase.from("pitch_tags").insert(tagRows);
        if (tagError) throw tagError;
      }

      if (selectedAwards.length > 0) {
        // status 'pending' until moderation approves the pitch and the
        // relevance check runs. A failure here must not sink the submission —
        // losing an award selection is recoverable, losing a pitch is not.
        const awardRows = selectedAwards.map((awardId) => ({
          pitch_id: pitch.id,
          award_id: awardId,
          status: "pending",
        }));
        const { error: awardError } = await supabase.from("pitch_awards").insert(awardRows);
        if (awardError) {
          console.warn("Award track selection failed to save:", awardError.message);
        }
      }

      // Upload thumbnail if provided
      if (thumbnail) {
        const thumbPath = `${user.id}/${pitch.id}/thumbnail_${thumbnail.name}`;
        const { error: thumbUploadError } = await supabase.storage
          .from("thumbnails")
          .upload(thumbPath, thumbnail);
        if (!thumbUploadError) {
          const { data: thumbUrl } = supabase.storage
            .from("thumbnails")
            .getPublicUrl(thumbPath);
          await supabase
            .from("pitches")
            .update({ thumbnail_path: thumbUrl.publicUrl })
            .eq("id", pitch.id);
        }
      }

      if (isMuxUpload) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) throw new Error("Unable to verify session for media upload.");

        const uploadRes = await fetch("/api/mux/create-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            pitchId: pitch.id,
            kind: isVideoUpload ? "video" : "audio",
          }),
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.uploadUrl) throw new Error(uploadData.error || "Failed to create upload session.");

        const putRes = await fetch(uploadData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`${isVideoUpload ? "Video" : "Audio"} upload failed. Please try again.`);

        await supabase.from("pitches").update({ mux_status: "processing", mux_error: null }).eq("id", pitch.id);
      } else if (file) {
        // Non-video file upload
        const filePath = `${user.id}/${pitch.id}/${file.name}`;
        const { error: uploadError } = await supabase.storage.from("pitch-files").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { error: updateError } = await supabase.from("pitches").update({ file_path: filePath, file_name: file.name }).eq("id", pitch.id);
        if (updateError) throw updateError;
      }
      // If text-only, no file to upload — pitch is already created with text_content

      // Kick off content moderation before we show success so text/document
      // pitches do not get stranded in `not_started` if the client leaves the
      // page immediately after submitting.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const moderationRes = await fetch("/api/intake/moderate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ pitchId: pitch.id }),
          });
          if (!moderationRes.ok) {
            console.warn("Initial moderation handoff failed", { pitchId: pitch.id, status: moderationRes.status });
          }
        }
      } catch {
        // Non-fatal — the reconciler can recover stranded rows.
      }

      setSubmittedVideoUpload(isMuxUpload);
      setSubmitted(true);
    } catch (err) {
      if (createdPitchId && file && (VIDEO_FILE_TYPES.includes(file?.type) || AUDIO_FILE_TYPES.includes(file?.type))) {
        await supabase.from("pitches").update({ mux_status: "errored", mux_error: err.message || "Upload failed." }).eq("id", createdPitchId);
      }
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = () => ({
    border: "2px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "0.75rem",
  });

  const renderFloor = () => {
    switch (floor) {
      case 0: return renderLanding();
      case 1: return renderYourInfo();
      case 2: return renderSchools();
      case 3: return renderPitchDetails();
      case 4: return renderTags();
      case 5: return renderPitchFile();
      case 6: return renderReview();
      case 7: return submitted ? renderSuccess() : renderSubmitFloor();
      default: return null;
    }
  };

  const renderLanding = () => (
    <div className="text-center">
      <Image
        src="/10kp_tspnt.png"
        alt="10KP Logo"
        width={270}
        height={90}
        className="w-auto h-[5.25rem] drop-shadow-lg mx-auto mb-8"
        priority
      />
      <h1 className="text-3xl font-bold text-white tracking-tight mb-4">
        The Only Way Is Up
      </h1>
      {competitionDescription ? (
        <p className="text-white/60 text-sm leading-relaxed mb-10 max-w-md mx-auto whitespace-pre-wrap">
          {competitionDescription}
        </p>
      ) : (
        <p className="text-white/60 text-sm leading-relaxed mb-10 max-w-md mx-auto">
          Step into the elevator and ride through 7 floors as you build and submit your pitch. Compete for exciting prizes and see if your idea rises to the top.
        </p>
      )}
      <button
        onClick={nextFloor}
        className="relative inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group"
        style={{ background: "#FFCB05" }}
      >
        <span className="relative z-10 flex items-center gap-2">
          Start Your Pitch
          <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </span>
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </button>
      <div className="mt-6">
        <Link href="/gallery" className="text-white/40 text-sm hover:text-white/70 transition-colors">
          or browse the Gallery
        </Link>
      </div>
    </div>
  );

  const renderYourInfo = () => (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Floor 1 — Your Info</h2>
      <p className="text-white/50 text-sm mb-6">Tell us who you are.</p>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-white/80 mb-2">
            Your Name <span className="text-maize">*</span>
          </label>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
            style={inputStyle()}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white/80 mb-2">
            Your Uniqname <span className="text-maize">*</span>
          </label>
          <div className="flex items-stretch rounded-xl overflow-hidden" style={inputStyle()}>
            <input
              type="text"
              placeholder="uniqname"
              value={uniqname}
              onChange={(e) => setUniqname(e.target.value)}
              onBlur={() => setUniqname((prev) => normalizeUniqname(prev))}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 px-4 py-3.5 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
            />
            <span
              className="flex items-center px-3 text-sm text-white/40 select-none flex-shrink-0"
              style={{ borderLeft: "1px solid rgba(255,255,255,0.12)" }}
            >
              @umich.edu
            </span>
          </div>
          <p className="text-xs text-white/40 mt-2">
            The part of your U-M email before @umich.edu.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white/80 mb-2">
            Teammates
          </label>
          <p className="text-xs text-white/40 mb-3">
            Pitching with others? Add each teammate&rsquo;s uniqname. Optional.
          </p>
          {teammateUniqnames.length > 0 && (
            <div className="space-y-3 mb-3">
              {teammateUniqnames.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="flex-1 min-w-0 flex items-stretch rounded-xl overflow-hidden"
                    style={inputStyle()}
                  >
                    <input
                      type="text"
                      placeholder="uniqname"
                      value={entry}
                      onChange={(e) => updateTeammate(index, e.target.value)}
                      onBlur={() => updateTeammate(index, normalizeUniqname(entry))}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="flex-1 min-w-0 px-4 py-3 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                    />
                    <span
                      className="flex items-center px-3 text-sm text-white/40 select-none flex-shrink-0"
                      style={{ borderLeft: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      @umich.edu
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTeammate(index)}
                    aria-label={`Remove teammate ${index + 1}`}
                    className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
                    style={{ border: "2px solid rgba(255,255,255,0.12)" }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addTeammate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors"
            style={{ border: "2px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Teammate
          </button>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white/80 mb-3">
            Are you <span className="text-maize">*</span>
          </label>
          <div className="space-y-2">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl transition-all duration-200"
                style={{
                  border: role === option ? "2px solid #FFCB05" : "2px solid rgba(255,255,255,0.12)",
                  background: role === option ? "rgba(255,203,5,0.08)" : "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: role === option ? "#FFCB05" : "rgba(255,255,255,0.3)",
                  }}
                >
                  {role === option && (
                    <div className="w-2 h-2 rounded-full" style={{ background: "#FFCB05" }} />
                  )}
                </div>
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  onChange={(e) => {
                    setRole(e.target.value);
                    if (e.target.value !== "Current student") setStudentLevel("");
                  }}
                  className="sr-only"
                />
                <span className="text-sm text-white/80">{option}</span>
              </label>
            ))}
          </div>
        </div>
        {role === "Current student" && (
          <div>
            <label className="block text-sm font-semibold text-white/80 mb-3">
              Student Level <span className="text-maize">*</span>
            </label>
            <div className="flex gap-2">
              {STUDENT_LEVEL_OPTIONS.map((option) => (
                <label
                  key={option}
                  className="flex-1 flex items-center justify-center gap-2 cursor-pointer px-3 py-2.5 rounded-xl transition-all duration-200"
                  style={{
                    border: studentLevel === option ? "2px solid #FFCB05" : "2px solid rgba(255,255,255,0.12)",
                    background: studentLevel === option ? "rgba(255,203,5,0.08)" : "rgba(255,255,255,0.03)",
                  }}
                >
                  <input
                    type="radio"
                    name="studentLevel"
                    value={option}
                    checked={studentLevel === option}
                    onChange={(e) => setStudentLevel(e.target.value)}
                    className="sr-only"
                  />
                  <span className="text-sm text-white/80">{option}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderSchools = () => (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Floor 2 — School(s)</h2>
      <p className="text-white/50 text-sm mb-6">What school(s) at U-M are you from?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {UM_SCHOOLS.map((school) => (
          <label
            key={school}
            className="flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-lg transition-all duration-200"
            style={{
              background: schools.includes(school) ? "rgba(255,203,5,0.08)" : "transparent",
            }}
          >
            <div
              className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
              style={{
                borderColor: schools.includes(school) ? "#FFCB05" : "rgba(255,255,255,0.25)",
                background: schools.includes(school) ? "#FFCB05" : "transparent",
              }}
            >
              {schools.includes(school) && (
                <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={schools.includes(school)}
              onChange={() => toggleSchool(school)}
              className="sr-only"
            />
            <span className="text-sm text-white/70">{school}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const renderPitchDetails = () => (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Floor 3 — Pitch Details</h2>
      <p className="text-white/50 text-sm mb-6">What is your big idea?</p>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-white/80 mb-2">
            Pitch Title <span className="text-maize">*</span>
          </label>
          <input
            type="text"
            placeholder="Give your pitch a title"
            value={pitchTitle}
            onChange={(e) => setPitchTitle(e.target.value)}
            className="w-full px-4 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
            style={inputStyle()}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-white/80 mb-2">
            Pitch Description <span className="text-maize">*</span>
          </label>
          <textarea
            placeholder="Describe your pitch in detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full px-4 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none resize-y"
            style={inputStyle()}
          />
        </div>
      </div>
    </div>
  );

  // The page is pinned to one viewport so the elevator background never
  // rescales, which gives this floor a fixed budget. Rather than guess at it in
  // viewport units, the layout divides it: the headings and the tag pane take
  // what they need, and the award pane absorbs whatever is left. Measured on a
  // 1440x900 window the headings cost ~270px, leaving ~325px for the two panes.
  const TAG_PANE_HEIGHT = "clamp(76px, 9vh, 120px)"; // ~2 rows of chips + a peek
  const AWARD_PANE_MIN_HEIGHT = 132;                 // ~1.5 cards; floor for short windows

  const renderTags = () => (
    <div className="flex flex-col h-full min-h-0">
      <h2 className="text-2xl font-bold text-white mb-4 flex-shrink-0">
        Floor 4 — Tags &amp; Awards
      </h2>

      {/* ── Tags: descriptive only ───────────────────────────────── */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Tags</h3>
          <span className="text-[11px] text-white/30">Optional</span>
        </div>
        <p className="text-white/40 text-xs mb-2 leading-relaxed">
          How your pitch is categorized in the gallery. Tags don&rsquo;t affect awards.
        </p>
        {availableTags.length > 0 ? (
          <ScrollPane style={{ maxHeight: TAG_PANE_HEIGHT }}>
            <div className="flex flex-wrap gap-2 pb-2">
              {availableTags.map((tag) => {
                const on = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={on}
                    className="px-4 py-2 text-sm rounded-full transition-all duration-200"
                    style={{
                      border: on ? "2px solid #FFCB05" : "2px solid rgba(255,255,255,0.15)",
                      background: on ? "rgba(255,203,5,0.15)" : "transparent",
                      color: on ? "#FFCB05" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </ScrollPane>
        ) : (
          <p className="text-white/40 text-sm italic">No tags available yet.</p>
        )}
      </div>

      {/* ── Award tracks: what the pitch competes for ─────────────── */}
      {availableAwards.length > 0 && (
        <div
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
          className="pt-3 flex-1 min-h-0 flex flex-col"
        >
          <div className="flex items-baseline justify-between gap-3 mb-1 flex-shrink-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Awards</h3>
            <span className="text-[11px] font-semibold" style={{ color: "#FFCB05" }}>
              Highly encouraged
            </span>
          </div>
          <p className="text-white/40 text-xs mb-2 leading-relaxed flex-shrink-0">
            Pick every award your pitch genuinely fits — we check each pick against the
            award&rsquo;s criteria after review, so extra picks gain you nothing.
            {raffleAward && (
              <>
                {" "}
                The <span className="text-white/60 font-semibold">{raffleAward.name}</span> is
                automatic.
              </>
            )}
          </p>

          <ScrollPane
            wrapperClassName="flex-1 min-h-0"
            className="h-full"
            style={{ minHeight: AWARD_PANE_MIN_HEIGHT }}
          >
            <div className="space-y-2 pb-3">
              {availableAwards.map((award) => {
                const on = selectedAwards.includes(award.id);
                return (
                  <button
                    key={award.id}
                    type="button"
                    onClick={() => toggleAward(award.id)}
                    aria-pressed={on}
                    className="w-full text-left rounded-xl p-3.5 transition-all duration-200 flex items-start gap-3"
                    style={{
                      border: on ? "2px solid #FFCB05" : "2px solid rgba(255,255,255,0.12)",
                      background: on ? "rgba(255,203,5,0.1)" : "rgba(255,255,255,0.03)",
                    }}
                  >
                    <span
                      className="mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        border: on ? "2px solid #FFCB05" : "2px solid rgba(255,255,255,0.25)",
                        background: on ? "#FFCB05" : "transparent",
                      }}
                      aria-hidden="true"
                    >
                      {on && (
                        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="#0B1A3B">
                          <path
                            fillRule="evenodd"
                            d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-sm font-bold"
                        style={{ color: on ? "#FFCB05" : "rgba(255,255,255,0.85)" }}
                      >
                        {award.name}
                      </span>
                      {award.prize && (
                        <span className="block text-[11px] font-semibold text-maize/70 mt-0.5">
                          {award.prize}
                        </span>
                      )}
                      {award.description && (
                        <span className="block text-xs text-white/45 mt-1 leading-relaxed">
                          {award.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollPane>

          <p className="text-[11px] text-white/30 mt-2 flex-shrink-0">
            {selectedAwards.length === 0
              ? "None selected — your pitch still appears in the gallery."
              : `${selectedAwards.length} award${selectedAwards.length === 1 ? "" : "s"} selected.`}
          </p>
        </div>
      )}
    </div>
  );

  const renderPitchFile = () => (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Floor 5 — Your Pitch</h2>
      <p className="text-white/50 text-sm mb-6">How would you like to submit your pitch?</p>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => { setPitchMode("file"); setTextContent(""); }}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200"
          style={{
            border: pitchMode === "file" ? "2px solid #FFCB05" : "2px solid rgba(255,255,255,0.12)",
            background: pitchMode === "file" ? "rgba(255,203,5,0.1)" : "transparent",
            color: pitchMode === "file" ? "#FFCB05" : "rgba(255,255,255,0.5)",
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload File
        </button>
        <button
          type="button"
          onClick={() => { setPitchMode("text"); setFile(null); }}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200"
          style={{
            border: pitchMode === "text" ? "2px solid #FFCB05" : "2px solid rgba(255,255,255,0.12)",
            background: pitchMode === "text" ? "rgba(255,203,5,0.1)" : "transparent",
            color: pitchMode === "text" ? "#FFCB05" : "rgba(255,255,255,0.5)",
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Write Text
        </button>
      </div>

      {pitchMode === "file" ? (
        <>
          <p className="text-white/40 text-xs mb-4">
            Video (MP4, MOV, WebM), Audio (MP3, WAV, OGG, AAC), or Document (PDF, DOCX, TXT). Max 500MB.
          </p>
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center w-full py-10 rounded-xl cursor-pointer transition-all duration-200 group"
            style={{
              border: "2px dashed rgba(255,255,255,0.15)",
              background: file ? "rgba(255,203,5,0.05)" : "rgba(255,255,255,0.03)",
            }}
          >
            {file ? (
              <>
                <svg className="w-10 h-10 mb-3" style={{ color: "#FFCB05" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-white/80 font-medium">{file.name}</span>
                <span className="text-xs text-white/40 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB — Click to change</span>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mb-3 text-white/30 group-hover:text-white/50 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-sm text-white/50 group-hover:text-white/70 transition-colors">Click to upload a file</span>
              </>
            )}
            <input
              id="file-upload"
              type="file"
              onChange={handleFileChange}
              accept={ACCEPTED_FILE_TYPES.join(",")}
              className="sr-only"
            />
          </label>
          {file && VIDEO_FILE_TYPES.includes(file.type) && (
            <p className="mt-3 text-xs text-white/40">
              Video files are processed after submission.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-white/40 text-xs mb-4">
            Type or paste your pitch text below.
          </p>
          <textarea
            placeholder="Type your pitch here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={8}
            className="w-full px-4 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none resize-y"
            style={inputStyle()}
          />
        </>
      )}

      {/* Thumbnail upload section */}
      <div className="mt-6 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-sm font-semibold text-white/70 mb-1">Thumbnail (optional)</p>
        <p className="text-white/40 text-xs mb-3">
          Upload a custom image to represent your pitch in the gallery.
        </p>

        {thumbnailPreview ? (
          <div className="flex items-start gap-3">
            <img
              src={thumbnailPreview}
              alt="Thumbnail preview"
              className="w-24 h-24 rounded-lg object-cover"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <div className="flex flex-col gap-2">
              <span className="text-xs text-white/50 truncate max-w-[180px]">{thumbnail?.name}</span>
              <button
                type="button"
                onClick={removeThumbnail}
                className="text-xs text-red-400 hover:text-red-300 transition-colors text-left"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor="thumbnail-upload"
            className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group"
            style={{
              border: "1px dashed rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <svg className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-white/30 group-hover:text-white/50 transition-colors">
              Choose thumbnail image (PNG, JPG, max 5MB)
            </span>
            <input
              id="thumbnail-upload"
              type="file"
              onChange={handleThumbnailChange}
              accept={IMAGE_FILE_TYPES.join(",")}
              className="sr-only"
            />
          </label>
        )}
      </div>
    </div>
  );

  const renderReview = () => {
    const pitchType = pitchMode === "text"
      ? (file ? `Text + ${file.name}` : "Text Submission")
      : (file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : "No file");

    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Floor 6 — Review</h2>
        <p className="text-white/50 text-sm mb-6">Double-check everything before you submit.</p>
        <div className="space-y-4">
          {[
            { label: "Name", value: name },
            { label: "Uniqname", value: normalizeUniqname(uniqname) ? `${normalizeUniqname(uniqname)}@umich.edu` : "" },
            ...(cleanedTeammates().length > 0
              ? [{ label: "Teammates", value: cleanedTeammates().map((u) => `${u}@umich.edu`).join(", ") }]
              : []),
            { label: "Role", value: role },
            ...(role === "Current student" && studentLevel ? [{ label: "Student Level", value: studentLevel }] : []),
            { label: "School(s)", value: schools.length > 0 ? schools.join(", ") : "None selected" },
            { label: "Pitch Title", value: pitchTitle },
            { label: "Description", value: description },
            { label: "Tags", value: selectedTags.length > 0 ? availableTags.filter((t) => selectedTags.includes(t.id)).map((t) => t.name).join(", ") : "None" },
            { label: "Awards Considered For", value: selectedAwards.length > 0 ? availableAwards.filter((a) => selectedAwards.includes(a.id)).map((a) => a.name).join(", ") : "None selected" },
            { label: "Pitch", value: pitchType },
            ...(pitchMode === "text" && textContent ? [{ label: "Text Content", value: textContent.length > 200 ? textContent.slice(0, 200) + "..." : textContent }] : []),
            ...(thumbnail ? [{ label: "Thumbnail", value: thumbnail.name }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm text-white/80 whitespace-pre-wrap">{value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSubmitFloor = () => (
    <div className="text-center">
      <h2 className="text-2xl font-bold text-white mb-2">Floor 7 — Submit</h2>
      <p className="text-white/50 text-sm mb-8">You have reached the top. Ready to pitch?</p>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="relative inline-flex items-center justify-center w-full py-4 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 active:translate-y-0 group"
        style={{ background: "#FFCB05" }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {submitting ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting your pitch...
            </>
          ) : (
            <>
              Submit Pitch
              <svg className="w-5 h-5 transition-transform group-hover:translate-y-[-2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </>
          )}
        </span>
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </button>
    </div>
  );

  const renderSuccess = () => (
    <div className="text-center">
      <svg className="w-20 h-20 mx-auto mb-6" style={{ color: "#FFCB05" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h2 className="text-3xl font-bold text-white mb-3">You Have Reached the Top!</h2>
      <p className="text-white/60 text-sm mb-2">
        Your pitch was submitted and is awaiting administrative review.
      </p>
      <p className="text-white/50 text-sm mb-2">
        It will appear in the gallery once it&rsquo;s approved
        {submittedVideoUpload ? " — media review can take a few minutes." : "."}
      </p>
      <p className="text-white/40 text-xs mb-10">Good luck in the competition.</p>
      <Link
        href="/gallery"
        className="relative inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group"
        style={{ background: "#FFCB05" }}
      >
        <span className="relative z-10 flex items-center gap-2">
          View the Gallery
          <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </span>
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </Link>
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="intake-shell relative flex overflow-hidden">
        {/* Background images with crossfade */}
        <div className="absolute inset-0">
          {backgroundLayers.map((layer) => (
            <div
              key={layer.key}
              className={`absolute inset-0 pointer-events-none select-none bg-cover ${layer.state === "outgoing" ? "elevator-bg-fade-out" : ""}`}
              style={{
                backgroundImage: `url('${FLOOR_IMAGES[layer.index]}')`,
                backgroundPosition: "center 15%",
                zIndex: layer.state === "outgoing" ? 1 : 0,
              }}
            />
          ))}
        </div>

        {/* Glass card on the left */}
        <div className="relative z-10 w-full lg:w-[520px] flex flex-col h-full min-h-0">
          <div
            className="flex-1 min-h-0 flex flex-col px-8 lg:px-12 py-10"
            style={{
              background: "rgba(11, 26, 59, 0.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {/* Floor indicator */}
            {floor > 0 && !submitted && (
              <div className="mb-8 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5, 6, 7].map((f) => (
                    <div
                      key={f}
                      className="h-1 flex-1 rounded-full transition-all duration-500"
                      style={{
                        background: f <= floor ? "#FFCB05" : "rgba(255,255,255,0.12)",
                      }}
                    />
                  ))}
                </div>
                <p className="text-white/30 text-xs uppercase tracking-wider">
                  Floor {floor} of 7 — {FLOOR_LABELS[floor]}
                </p>
              </div>
            )}

            {/* Error */}
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

            {/* Content — the only part of the column that scrolls. `safe center`
                keeps short floors visually centered while leaving tall ones
                (Schools, Review) reachable from the top. */}
            <div
              className={`flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}
              style={{ justifyContent: "safe center" }}
            >
              <div className={`w-full flex-shrink-0 ${floor === 4 ? "h-full min-h-0" : ""}`}>
                {renderFloor()}
              </div>
            </div>

            {/* Navigation buttons */}
            {floor > 0 && floor <= 7 && !submitted && (
              <div className="flex gap-3 mt-8 flex-shrink-0">
                <button
                  onClick={prevFloor}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-xl transition-all duration-200"
                  style={{
                    border: "2px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.7)",
                    background: "transparent",
                  }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Back
                </button>
                {floor < 7 && (
                  <button
                    onClick={nextFloor}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-all duration-200 text-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group"
                    style={{ background: "#FFCB05" }}
                  >
                    Next Floor
                    <svg className="w-4 h-4 transition-transform group-hover:translate-y-[-2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
