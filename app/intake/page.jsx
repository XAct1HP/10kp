"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import Image from "next/image";
import Link from "next/link";
import ProtectedRoute from "../../components/ProtectedRoute";

const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
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
const AUDIO_FILE_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/aac", "audio/webm"];
const IMAGE_FILE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;

const ROLE_OPTIONS = [
  "Current student",
  "Current staff or faculty",
  "Alumni",
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
  "Social Work",
];

const FLOOR_IMAGES = [
  "/elevator/pitch_no_floor.png",
  "/elevator/pitch_floor1.png",
  "/elevator/pitch_floor2.png",
  "/elevator/pitch_floor3.png",
  "/elevator/pitch_floor4.png",
  "/elevator/pitch_floor5.png",
  "/elevator/pitch_floor6.png",
  "/elevator/pitch_floor7.png",
];

const FLOOR_LABELS = [
  "Lobby",
  "Your Info",
  "School(s)",
  "Pitch Details",
  "Tags",
  "Pitch File",
  "Review",
  "Submit",
];

export default function IntakePage() {
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [pitchTitle, setPitchTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [role, setRole] = useState("");
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

  const [competitionDescription, setCompetitionDescription] = useState("");

  useEffect(() => {
    FLOOR_IMAGES.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);

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

  const goToFloor = (newFloor) => {
    if (newFloor === floor || transitioning) return;
    setTransitioning(true);
    setTimeout(() => {
      setBgIndex(newFloor);
      setFloor(newFloor);
      setTimeout(() => setTransitioning(false), 400);
    }, 300);
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
        if (!role) return "Please select your role.";
        return null;
      case 3:
        if (!pitchTitle.trim()) return "Please enter a pitch title.";
        if (!description.trim()) return "Please enter a description.";
        return null;
      case 5:
        if (pitchMode === "file" && !file) return "Please upload a pitch file.";
        if (pitchMode === "text" && !textContent.trim() && !file) return "Please enter your pitch text or upload a text file.";
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

  const toggleSchool = (school) => {
    setSchools((prev) =>
      prev.includes(school) ? prev.filter((s) => s !== school) : [...prev, school]
    );
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError("File must be under 50MB.");
      setFile(null);
      return;
    }
    if (!ACCEPTED_FILE_TYPES.includes(selected.type)) {
      setError("Unsupported file type. Please upload a PDF, document, video, audio, or image.");
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
    if (IMAGE_FILE_TYPES.includes(file.type)) return "image";
    return "file";
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    const isVideoUpload = file && VIDEO_FILE_TYPES.includes(file.type);
    const isTextOnly = pitchMode === "text" && !file;
    let createdPitchId = null;

    try {
      const { data: pitch, error: pitchError } = await supabase
        .from("pitches")
        .insert({
          user_id: user.id,
          name: name.trim(),
          role,
          schools,
          title: pitchTitle.trim(),
          description: description.trim(),
          file_type: isVideoUpload ? "video" : "file",
          file_name: file ? file.name : (isTextOnly ? "Text Submission" : null),
          text_content: pitchMode === "text" ? textContent.trim() || null : null,
          mux_status: isVideoUpload ? "pending" : null,
          mux_error: null,
        })
        .select()
        .single();

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

      if (isVideoUpload) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) throw new Error("Unable to verify session for video upload.");

        const uploadRes = await fetch("/api/mux/create-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ pitchId: pitch.id }),
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.uploadUrl) throw new Error(uploadData.error || "Failed to create video upload session.");

        const putRes = await fetch(uploadData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error("Video upload failed. Please try again.");

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

      setSubmittedVideoUpload(isVideoUpload);
      setSubmitted(true);
    } catch (err) {
      if (createdPitchId && file && VIDEO_FILE_TYPES.includes(file?.type)) {
        await supabase.from("pitches").update({ mux_status: "errored", mux_error: err.message || "Video upload failed." }).eq("id", createdPitchId);
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
        Your Elevator Pitch Starts Here
      </h1>
      {competitionDescription ? (
        <p className="text-white/60 text-sm leading-relaxed mb-10 max-w-md mx-auto whitespace-pre-wrap">
          {competitionDescription}
        </p>
      ) : (
        <p className="text-white/60 text-sm leading-relaxed mb-10 max-w-md mx-auto">
          Submit your pitch and compete for the $10,000 prize. You will ride the elevator 7 floors — each floor gets you one step closer to the top.
        </p>
      )}
      <button
        onClick={nextFloor}
        className="relative inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group"
        style={{ background: "#F2B517" }}
      >
        <span className="relative z-10 flex items-center gap-2">
          Begin Your Elevator Pitch
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
          <label className="block text-sm font-semibold text-white/80 mb-3">
            Are you <span className="text-maize">*</span>
          </label>
          <div className="space-y-2">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl transition-all duration-200"
                style={{
                  border: role === option ? "2px solid #F2B517" : "2px solid rgba(255,255,255,0.12)",
                  background: role === option ? "rgba(242,181,23,0.08)" : "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: role === option ? "#F2B517" : "rgba(255,255,255,0.3)",
                  }}
                >
                  {role === option && (
                    <div className="w-2 h-2 rounded-full" style={{ background: "#F2B517" }} />
                  )}
                </div>
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  onChange={(e) => setRole(e.target.value)}
                  className="sr-only"
                />
                <span className="text-sm text-white/80">{option}</span>
              </label>
            ))}
          </div>
        </div>
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
              background: schools.includes(school) ? "rgba(242,181,23,0.08)" : "transparent",
            }}
          >
            <div
              className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
              style={{
                borderColor: schools.includes(school) ? "#F2B517" : "rgba(255,255,255,0.25)",
                background: schools.includes(school) ? "#F2B517" : "transparent",
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

  const renderTags = () => (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Floor 4 — Tags</h2>
      <p className="text-white/50 text-sm mb-6">Categorize your pitch.</p>
      {availableTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className="px-4 py-2 text-sm rounded-full transition-all duration-200"
              style={{
                border: selectedTags.includes(tag.id) ? "2px solid #F2B517" : "2px solid rgba(255,255,255,0.15)",
                background: selectedTags.includes(tag.id) ? "rgba(242,181,23,0.15)" : "transparent",
                color: selectedTags.includes(tag.id) ? "#F2B517" : "rgba(255,255,255,0.6)",
              }}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-white/40 text-sm italic">No tags available yet.</p>
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
          onClick={() => setPitchMode("file")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200"
          style={{
            border: pitchMode === "file" ? "2px solid #F2B517" : "2px solid rgba(255,255,255,0.12)",
            background: pitchMode === "file" ? "rgba(242,181,23,0.1)" : "transparent",
            color: pitchMode === "file" ? "#F2B517" : "rgba(255,255,255,0.5)",
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload File
        </button>
        <button
          type="button"
          onClick={() => setPitchMode("text")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200"
          style={{
            border: pitchMode === "text" ? "2px solid #F2B517" : "2px solid rgba(255,255,255,0.12)",
            background: pitchMode === "text" ? "rgba(242,181,23,0.1)" : "transparent",
            color: pitchMode === "text" ? "#F2B517" : "rgba(255,255,255,0.5)",
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
            PDF, document, video, audio, or image (max 50MB).
          </p>
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center w-full py-10 rounded-xl cursor-pointer transition-all duration-200 group"
            style={{
              border: "2px dashed rgba(255,255,255,0.15)",
              background: file ? "rgba(242,181,23,0.05)" : "rgba(255,255,255,0.03)",
            }}
          >
            {file ? (
              <>
                <svg className="w-10 h-10 mb-3" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            Type or paste your pitch text below. You can also optionally attach a text file (PDF, DOCX, TXT).
          </p>
          <textarea
            placeholder="Type your pitch here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={8}
            className="w-full px-4 py-3.5 bg-transparent rounded-xl text-sm text-white placeholder-white/30 focus:outline-none resize-y mb-4"
            style={inputStyle()}
          />

          {/* Optional file attachment in text mode */}
          <div>
            <p className="text-white/40 text-xs mb-2">Optionally attach a document:</p>
            <label
              htmlFor="text-file-upload"
              className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group"
              style={{
                border: "1px dashed rgba(255,255,255,0.12)",
                background: file ? "rgba(242,181,23,0.05)" : "rgba(255,255,255,0.02)",
              }}
            >
              {file ? (
                <>
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                  </svg>
                  <span className="text-sm text-white/70 truncate">{file.name}</span>
                  <span className="text-xs text-white/30 ml-auto">Click to change</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-sm text-white/30 group-hover:text-white/50 transition-colors">Attach PDF, DOCX, or TXT</span>
                </>
              )}
              <input
                id="text-file-upload"
                type="file"
                onChange={handleFileChange}
                accept={TEXT_FILE_TYPES.join(",")}
                className="sr-only"
              />
            </label>
          </div>
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
            { label: "Role", value: role },
            { label: "School(s)", value: schools.length > 0 ? schools.join(", ") : "None selected" },
            { label: "Pitch Title", value: pitchTitle },
            { label: "Description", value: description },
            { label: "Tags", value: selectedTags.length > 0 ? availableTags.filter((t) => selectedTags.includes(t.id)).map((t) => t.name).join(", ") : "None" },
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
        style={{ background: "#F2B517" }}
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
      <svg className="w-20 h-20 mx-auto mb-6" style={{ color: "#F2B517" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h2 className="text-3xl font-bold text-white mb-3">You have Reached the Top!</h2>
      <p className="text-white/60 text-sm mb-2">
        {submittedVideoUpload
          ? "Your pitch was submitted. Video processing may take a few minutes."
          : "Your pitch has been submitted successfully!"}
      </p>
      <p className="text-white/40 text-xs mb-10">Good luck in the competition.</p>
      <Link
        href="/gallery"
        className="relative inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden text-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group"
        style={{ background: "#F2B517" }}
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
      <div className="relative min-h-[calc(100vh-4rem)] flex overflow-hidden">
        {/* Background images with crossfade */}
        {FLOOR_IMAGES.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 bg-cover transition-opacity duration-700 ease-in-out"
            style={{
              backgroundImage: `url('${src}')`,
              backgroundPosition: "center 15%",
              opacity: bgIndex === i ? 1 : 0,
              zIndex: 0,
            }}
          />
        ))}

        {/* Glass card on the left */}
        <div className="relative z-10 w-full lg:w-[520px] flex flex-col min-h-[calc(100vh-4rem)]">
          <div
            className="flex-1 flex flex-col justify-center px-8 lg:px-12 py-10"
            style={{
              background: "rgba(11, 26, 59, 0.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {/* Floor indicator */}
            {floor > 0 && !submitted && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5, 6, 7].map((f) => (
                    <div
                      key={f}
                      className="h-1 flex-1 rounded-full transition-all duration-500"
                      style={{
                        background: f <= floor ? "#F2B517" : "rgba(255,255,255,0.12)",
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

            {/* Content */}
            <div className={`transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}>
              {renderFloor()}
            </div>

            {/* Navigation buttons */}
            {floor > 0 && floor <= 7 && !submitted && (
              <div className="flex gap-3 mt-8">
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
                    style={{ background: "#F2B517" }}
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
