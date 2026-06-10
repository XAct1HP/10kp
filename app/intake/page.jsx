"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import ProtectedRoute from "../../components/ProtectedRoute";

// Accepted file types for pitch materials
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "text/plain",
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg", // .mp3
  "audio/wav", // .wav
  "audio/ogg", // .ogg
  "audio/mp4", // .m4a
  "audio/aac", // .aac
  "audio/webm", // .weba
];
const VIDEO_FILE_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch available tags from the database
  useEffect(() => {
    async function fetchTags() {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");
      if (!error && data) {
        setAvailableTags(data);
      }
    }
    fetchTags();
  }, []);

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const toggleSchool = (school) => {
    setSchools((prev) =>
      prev.includes(school)
        ? prev.filter((s) => s !== school)
        : [...prev, school]
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
      setError(
        "Unsupported file type. Please upload a PDF, document, video, audio, or image."
      );
      setFile(null);
      return;
    }

    setError("");
    setFile(selected);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!name.trim() || !pitchTitle.trim() || !description.trim() || !role) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!file) {
      setError("Please upload a pitch file.");
      return;
    }

    setSubmitting(true);
    const isVideoUpload = VIDEO_FILE_TYPES.includes(file.type);
    let createdPitchId = null;

    try {
      // 1. Create the pitch record
      const { data: pitch, error: pitchError } = await supabase
        .from("pitches")
        .insert({
          user_id: user.id,
          name: name.trim(),
          role: role,
          schools: schools,
          title: pitchTitle.trim(),
          description: description.trim(),
          file_type: isVideoUpload ? "video" : "file",
          file_name: file.name,
          mux_status: isVideoUpload ? "pending" : null,
        })
        .select()
        .single();

      if (pitchError) throw pitchError;
      createdPitchId = pitch.id;

      // 2. Insert tag associations
      if (selectedTags.length > 0) {
        const tagRows = selectedTags.map((tagId) => ({
          pitch_id: pitch.id,
          tag_id: tagId,
        }));

        const { error: tagError } = await supabase
          .from("pitch_tags")
          .insert(tagRows);

        if (tagError) throw tagError;
      }

      if (isVideoUpload) {
        // 3A. Request a one-time Mux direct upload URL
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
          throw new Error("Unable to verify session for video upload.");
        }

        const uploadRes = await fetch("/api/mux/create-upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ pitchId: pitch.id }),
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.uploadUrl) {
          throw new Error(uploadData.error || "Failed to create video upload session.");
        }

        // 3B. Upload the video directly to Mux
        const putRes = await fetch(uploadData.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!putRes.ok) {
          throw new Error("Video upload failed. Please try again.");
        }

        // Upload is done; Mux may still be processing before ready state.
        const { error: muxStateError } = await supabase
          .from("pitches")
          .update({ mux_status: "processing" })
          .eq("id", pitch.id);
        if (muxStateError) throw muxStateError;
      } else {
        // 3A. Upload non-video file to Supabase Storage
        const filePath = `${user.id}/${pitch.id}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("pitch-files")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        // 3B. Update pitch with storage path
        const { error: updateError } = await supabase
          .from("pitches")
          .update({ file_path: filePath, file_name: file.name })
          .eq("id", pitch.id);
        if (updateError) throw updateError;
      }

      // Success — reset form
      setSuccessMessage(
        isVideoUpload
          ? "Your pitch was submitted. Video processing may take a few minutes."
          : "Your pitch has been submitted successfully!"
      );
      setName("");
      setRole("");
      setSchools([]);
      setPitchTitle("");
      setDescription("");
      setSelectedTags([]);
      setFile(null);
      // Reset file input
      const fileInput = document.getElementById("file-upload");
      if (fileInput) fileInput.value = "";
    } catch (err) {
      if (createdPitchId && VIDEO_FILE_TYPES.includes(file?.type)) {
        await supabase
          .from("pitches")
          .update({ mux_status: "errored" })
          .eq("id", createdPitchId);
      }
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Submit Your Pitch</h1>
        <p className="text-sm text-gray-500 mb-8">
          Fill out the form below to submit your pitch to 10KP.
        </p>

        {successMessage && (
          <div className="mb-6 p-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Your Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Are You (Role) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Are you <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((option) => (
                <label key={option} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value={option}
                    checked={role === option}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-4 w-4 text-gray-900 border-gray-300 focus:ring-gray-900"
                  />
                  <span className="text-sm text-gray-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* School(s) at U-M */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What school(s) at U-M are you from?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {UM_SCHOOLS.map((school) => (
                <label key={school} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schools.includes(school)}
                    onChange={() => toggleSchool(school)}
                    className="h-4 w-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                  />
                  <span className="text-sm text-gray-700">{school}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Pitch Title */}
          <div>
            <label htmlFor="pitchTitle" className="block text-sm font-medium text-gray-700 mb-1">
              Pitch Title <span className="text-red-500">*</span>
            </label>
            <input
              id="pitchTitle"
              type="text"
              placeholder="Give your pitch a title"
              value={pitchTitle}
              onChange={(e) => setPitchTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Pitch Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              placeholder="Describe your pitch in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-y"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            {availableTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      selectedTags.includes(tag.id)
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No tags available yet. Tags will appear here once they are added.
              </p>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">
              Pitch File <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Upload one file: PDF, document, video, audio, or image (max 50MB).
            </p>
            <input
              id="file-upload"
              type="file"
              onChange={handleFileChange}
              accept={ACCEPTED_FILE_TYPES.join(",")}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer cursor-pointer"
            />
            {file && (
              <p className="mt-2 text-xs text-gray-500">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
            {file && VIDEO_FILE_TYPES.includes(file.type) && (
              <p className="mt-1 text-xs text-gray-500">
                Video files are uploaded to Mux and processed after submission.
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Pitch"}
          </button>
        </form>
      </div>
    </ProtectedRoute>
  );
}
