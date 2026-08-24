"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm"];
const MAX_SIZE = 500 * 1024 * 1024;

const SAMPLE_CSV = `title,name,year,award,filename
Ann Arbor Aquaponics,Jane Doe,2025,Grand Prize,aquaponics.mp4
Campus Commute,Alex Kim,2025,Audience Choice,campus-commute.mov
Study Buddy AI,Sam Patel,2025,Innovation Award,study-buddy.webm
`;

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
};

function defaultWinnerYear() {
  return new Date().getFullYear() - 1;
}

/** Prefer a 20xx year in the CSV filename (e.g. "2025 10KP Awards…"). */
function yearFromCsvFilename(name) {
  const m = String(name || "").match(/\b(20\d{2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1900 && n <= 2200 ? n : null;
}

/** Strip path + normalize for case-insensitive basename matching. */
function normalizeFilename(raw) {
  const base = String(raw || "")
    .trim()
    .replace(/^.*[\\/]/, "")
    .toLowerCase();
  return base;
}

/** Slug used to pair pitch titles with video basenames. */
function titleSlug(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Submittable gallery URL → numeric submission id (last path segment). */
function gallerySubmissionId(link) {
  const m = String(link || "")
    .trim()
    .match(/\/(\d{5,})\/?\s*$/);
  return m ? m[1] : null;
}

/** Match with or without extension (CSV may list "clip" or "clip.mp4"). */
function filenameKeys(raw) {
  const key = normalizeFilename(raw);
  if (!key) return [];
  const keys = new Set([key]);
  const dot = key.lastIndexOf(".");
  const stem = dot > 0 ? key.slice(0, dot) : key;
  keys.add(stem);
  const slug = titleSlug(stem);
  if (slug) keys.add(slug);
  if (dot <= 0) {
    for (const ext of VIDEO_EXTS) keys.add(key + ext);
  }
  return [...keys];
}

function fileStem(name) {
  const base = normalizeFilename(name);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Score how well a video filename matches a CSV winner row.
 * Real award zips use submitter names / short titles (LoadShare.mp4),
 * not gallery ids — so we fuzzy-match title + name tokens.
 */
function scoreVideoForRow(row, file) {
  const stem = fileStem(file.name);
  const stemSlug = titleSlug(stem);
  const stemCompact = stemSlug.replace(/-/g, "");
  if (!stemSlug) return 0;

  let score = 0;

  for (const key of row.matchKeys || []) {
    const k = String(key).toLowerCase();
    if (!k) continue;
    if (k === stem || k === stemSlug || k === normalizeFilename(file.name)) {
      return 100;
    }
    if (k.length >= 5 && (stemSlug === titleSlug(k) || stemCompact.includes(k.replace(/[^a-z0-9]/g, "")))) {
      score = Math.max(score, 95);
    }
  }

  const titleS = titleSlug(row.title);
  const titleCompact = titleS.replace(/-/g, "");
  if (stemSlug === titleS) return 98;
  if (titleS.length >= 5 && (stemSlug.includes(titleS) || titleS.includes(stemSlug))) {
    score = Math.max(score, 88);
  }

  const shortTitle = String(row.title || "").split(/[:–—-]/)[0].trim();
  const shortSlug = titleSlug(shortTitle);
  if (shortSlug.length >= 4) {
    if (
      stemSlug === shortSlug ||
      stemSlug.includes(shortSlug) ||
      shortSlug.includes(stemSlug)
    ) {
      score = Math.max(score, 85);
    }
    const shortCompact = shortSlug.replace(/-/g, "");
    if (shortCompact.length >= 4 && stemCompact.includes(shortCompact)) {
      score = Math.max(score, 84);
    }
  }

  // Distinctive tokens (bazaar, lume, edubridge, loadshare, …)
  const tokens = titleS.split("-").filter((t) => t.length >= 5);
  let hits = 0;
  for (const t of tokens) {
    if (stemSlug.includes(t) || stemCompact.includes(t)) hits += 1;
  }
  if (hits) score = Math.max(score, 50 + hits * 12);

  const parts = String(row.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = titleSlug(parts[0] || "");
  const last = titleSlug(parts[parts.length - 1] || "");
  const nameCompact = titleSlug(row.name).replace(/-/g, "");
  if (nameCompact.length >= 6 && stemCompact.includes(nameCompact)) {
    score = Math.max(score, 80);
  }
  if (first && last && stemCompact.includes(first + last)) {
    score = Math.max(score, 78);
  }
  // Sophia / Sophie style: shared prefix + last name
  if (first.length >= 4 && last.length >= 4) {
    const prefix = first.slice(0, Math.min(5, first.length));
    if (stemSlug.includes(prefix) && stemSlug.includes(last)) {
      score = Math.max(score, 72);
    } else if (stemSlug.includes(last)) {
      score = Math.max(score, 55);
    }
  }

  return score;
}

const AUTO_MATCH_MIN_SCORE = 55;

/**
 * Greedy assignment: highest scores first. Pass 1 uses each file once;
 * pass 2 reuses files for leftover rows (same pitch, multiple awards).
 */
function autoAssignVideos(rows, videos) {
  const candidates = [];
  for (const row of rows) {
    for (const file of videos) {
      const score = scoreVideoForRow(row, file);
      if (score >= AUTO_MATCH_MIN_SCORE) {
        candidates.push({ rowId: row.id, file, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.rowId.localeCompare(b.rowId));

  const assignment = new Map();
  const usedRows = new Set();
  const usedFiles = new Set();

  for (const c of candidates) {
    if (usedRows.has(c.rowId) || usedFiles.has(c.file)) continue;
    assignment.set(c.rowId, { file: c.file, score: c.score, auto: true });
    usedRows.add(c.rowId);
    usedFiles.add(c.file);
  }
  for (const c of candidates) {
    if (usedRows.has(c.rowId)) continue;
    assignment.set(c.rowId, { file: c.file, score: c.score, auto: true });
    usedRows.add(c.rowId);
  }
  return assignment;
}

function isVideoFile(file) {
  if (!file) return false;
  if (file.type && VIDEO_TYPES.includes(file.type)) return true;
  const lower = (file.name || "").toLowerCase();
  return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
}

function isZipFile(file) {
  if (!file) return false;
  if (file.type === "application/zip" || file.type === "application/x-zip-compressed") {
    return true;
  }
  return /\.zip$/i.test(file.name || "");
}

function mimeForVideoName(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}

/**
 * Unpack MP4/MOV/WebM entries from a zip into browser File objects.
 * Skips directories, __MACOSX, and hidden junk.
 */
async function extractVideosFromZip(zipFile, { onProgress } = {}) {
  const zip = await JSZip.loadAsync(zipFile);
  const entries = Object.values(zip.files).filter((entry) => {
    if (entry.dir) return false;
    const parts = entry.name.split(/[/\\]/);
    if (parts.some((p) => p === "__MACOSX" || p.startsWith("."))) return false;
    const base = parts[parts.length - 1] || "";
    return VIDEO_EXTS.some((ext) => base.toLowerCase().endsWith(ext));
  });

  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.(i, entries.length, entry.name);
    const base = entry.name.split(/[/\\]/).pop() || entry.name;
    const blob = await entry.async("blob");
    files.push(
      new File([blob], base, {
        type: mimeForVideoName(base),
        lastModified: entry.date?.getTime?.() || Date.now(),
      })
    );
  }
  return files;
}

/** RFC4180-ish CSV parse that keeps newlines inside quoted fields. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  const s = String(text || "").replace(/^\uFEFF/, "");

  const pushRow = () => {
    // Skip fully empty trailing rows.
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    if (row.length) rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      cur = "";
      pushRow();
    } else if (c === "\r") {
      // swallow; handle CRLF via following \n, lone CR as row break
      if (s[i + 1] !== "\n") {
        row.push(cur);
        cur = "";
        pushRow();
      }
    } else {
      cur += c;
    }
  }
  row.push(cur);
  pushRow();
  return rows.map((r) => r.map((cell) => String(cell).trim()));
}

function headerKey(raw) {
  const original = String(raw || "").trim();
  const lower = original.toLowerCase();
  const compact = lower
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  // Submittable / Google Sheets awards export
  if (compact === "title") return "title";
  if (compact === "submitter_first_name" || compact === "first_name") {
    return "firstName";
  }
  if (compact === "submitter_last_name" || compact === "last_name") {
    return "lastName";
  }
  if (
    compact === "name" ||
    compact === "submitter" ||
    compact === "submitter_name" ||
    compact === "winner"
  ) {
    return "name";
  }
  if (compact === "award" || (compact.startsWith("award") && !compact.includes("amount"))) {
    return "award";
  }
  if (
    ["year", "winner_year", "competition_year"].includes(compact)
  ) {
    return "year";
  }
  if (
    ["filename", "file", "file_name", "video", "video_file"].includes(compact)
  ) {
    return "filename";
  }
  if (compact === "gallery_link" || compact === "gallerylink" || lower === "gallery link") {
    return "galleryLink";
  }
  if (
    compact.includes("what_would_you_like_to_share") ||
    compact === "description" ||
    lower.includes("what would you like to share")
  ) {
    return "description";
  }
  return null;
}

function uniqueKeys(list) {
  const out = [];
  const seen = new Set();
  for (const k of list) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Parse winners CSV into row objects.
 * Supports:
 *   • Simple template: title, name, year, award, filename
 *   • Submittable awards export: Title, Submitter First/Last Name, Award,
 *     Gallery Link, description columns (filename optional — pair by title
 *     or gallery submission id when videos are dropped)
 */
export function parseWinnersCsv(text, { csvFilename = "" } = {}) {
  const table = parseCsv(text).filter((r) => r.some((c) => c.length > 0));
  if (table.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const headers = table[0].map(headerKey);
  const hasTitle = headers.includes("title");
  const hasName =
    headers.includes("name") ||
    (headers.includes("firstName") && headers.includes("lastName"));

  if (!hasTitle || !hasName) {
    throw new Error(
      'CSV needs a Title column and submitter name (Name, or Submitter First/Last Name). Also supported: simple template with title, name, year, award, filename.'
    );
  }

  const inferredYear = yearFromCsvFilename(csvFilename);
  const rows = [];
  const errors = [];

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const raw = {
      title: "",
      name: "",
      firstName: "",
      lastName: "",
      year: "",
      award: "",
      filename: "",
      galleryLink: "",
      description: "",
    };
    headers.forEach((key, idx) => {
      if (key) raw[key] = cells[idx] ?? "";
    });

    const lineNo = i + 1;
    const title = raw.title.trim();
    const name = (
      raw.name.trim() ||
      `${raw.firstName.trim()} ${raw.lastName.trim()}`.trim()
    );
    if (!title || !name) {
      errors.push(`Row ${lineNo}: title and submitter name are required.`);
      continue;
    }

    let year = null;
    if (raw.year.trim()) {
      const n = Number(raw.year.trim());
      if (!Number.isInteger(n) || n < 1900 || n > 2200) {
        errors.push(
          `Row ${lineNo}: year must be an integer between 1900 and 2200.`
        );
        continue;
      }
      year = n;
    } else {
      year = inferredYear ?? defaultWinnerYear();
    }

    const filename = raw.filename.trim();
    const galleryId = gallerySubmissionId(raw.galleryLink);
    const slug = titleSlug(title);
    const matchKeys = uniqueKeys([
      ...filenameKeys(filename),
      ...(galleryId ? [galleryId, ...filenameKeys(galleryId)] : []),
      ...filenameKeys(title),
      ...(slug ? [slug] : []),
    ]);

    if (!filename && matchKeys.length === 0) {
      errors.push(
        `Row ${lineNo}: no filename, gallery id, or title to match a video.`
      );
      continue;
    }

    const description = raw.description.trim();
    rows.push({
      id: `csv-${lineNo}-${slug || normalizeFilename(filename) || galleryId || lineNo}`,
      title,
      name,
      year,
      award: raw.award.trim(),
      filename: filename || (galleryId ? `${galleryId}.mp4` : `${slug || "video"}.mp4`),
      matchKeys,
      galleryId,
      description: description || null,
      matchHint: filename
        ? filename
        : galleryId
          ? `gallery #${galleryId} or title`
          : "title / slug",
    });
  }

  if (rows.length === 0) {
    throw new Error(
      errors[0] || "No valid CSV rows found. Check title and submitter name."
    );
  }

  return { rows, errors };
}

function uploadToMux(uploadUrl, video, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", video.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Mux upload failed (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error during Mux upload."));
    xhr.send(video);
  });
}

/**
 * Bulk CSV + folder upload for past winners.
 * Pairs CSV rows to video files by filename, then reuses POST /api/admin/seed-pitches.
 */
export default function SeedBulkUpload({
  apiFetch,
  awards,
  onAwardsChange,
  winnerMetaReady,
  onError,
  onSuccess,
  onPitchCreated,
  disabled = false,
  onBusyChange,
}) {
  const [csvRows, setCsvRows] = useState([]);
  const [csvName, setCsvName] = useState("");
  const [csvWarnings, setCsvWarnings] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);
  const [folderLabel, setFolderLabel] = useState("");
  // Manual row → video filename overrides (opaque zip names).
  const [videoOverrides, setVideoOverrides] = useState({});
  const [rowState, setRowState] = useState({});
  const [uploading, setUploading] = useState(false);
  const [overall, setOverall] = useState({ done: 0, total: 0, current: "" });

  const csvInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [unzipping, setUnzipping] = useState(false);
  const [unzipLabel, setUnzipLabel] = useState("");

  useEffect(() => {
    onBusyChange?.(uploading || unzipping);
  }, [uploading, unzipping, onBusyChange]);

  const ingestVideoFiles = (files, sourceLabel) => {
    const list = Array.from(files || []);
    if (!list.length) return;

    const unique = [];
    const seenNames = new Set();
    const skipped = [];
    for (const file of list) {
      if (!isVideoFile(file)) continue;
      if (file.size > MAX_SIZE) {
        skipped.push(`${file.name} (over 500MB)`);
        continue;
      }
      const key = `${file.name}::${file.size}`;
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      unique.push(file);
    }

    setVideoFiles(unique);
    setVideoOverrides({});
    const topFolder =
      sourceLabel ||
      list[0]?.webkitRelativePath?.split("/")?.[0] ||
      (unique.length === 1 ? unique[0].name : "selected videos");
    setFolderLabel(topFolder || "selected videos");
    setRowState({});

    if (unique.length === 0) {
      onError?.("No MP4, MOV, or WebM videos found.");
    } else if (skipped.length) {
      onError?.(
        `Loaded ${unique.length} video(s); skipped: ${skipped.slice(0, 3).join(", ")}${
          skipped.length > 3 ? "…" : ""
        }`
      );
    } else {
      onSuccess?.(
        `Loaded ${unique.length} video(s) from ${topFolder || "selection"}. Pair any unmatched rows with the Video dropdown.`
      );
    }
  };

  const ingestZipFile = async (file) => {
    if (!file) return;
    setUnzipping(true);
    setUnzipLabel(`Reading ${file.name}…`);
    try {
      const videos = await extractVideosFromZip(file, {
        onProgress: (i, total, name) => {
          setUnzipLabel(`Extracting ${i + 1}/${total}: ${name.split(/[/\\]/).pop()}`);
        },
      });
      if (!videos.length) {
        onError?.(
          `No MP4, MOV, or WebM videos found inside ${file.name}.`
        );
        return;
      }
      ingestVideoFiles(videos, file.name);
    } catch (err) {
      onError?.(err.message || `Failed to open zip: ${file.name}`);
    } finally {
      setUnzipping(false);
      setUnzipLabel("");
    }
  };

  const ingestCsvFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { rows, errors } = parseWinnersCsv(text, { csvFilename: file.name });
      setCsvRows(rows);
      setCsvName(file.name);
      setCsvWarnings(errors);
      setVideoOverrides({});
      setRowState({});
      if (errors.length) {
        onError?.(
          `CSV loaded with ${rows.length} row(s); ${errors.length} row(s) skipped.`
        );
      } else {
        onSuccess?.(`Loaded ${rows.length} row(s) from ${file.name}.`);
      }
    } catch (err) {
      setCsvRows([]);
      setCsvName("");
      setCsvWarnings([]);
      onError?.(err.message);
    }
  };

  /** Recursively collect File objects from a dropped directory entry. */
  const collectFromEntry = (entry) =>
    new Promise((resolve) => {
      if (!entry) {
        resolve([]);
        return;
      }
      if (entry.isFile) {
        entry.file(
          (file) => resolve([file]),
          () => resolve([])
        );
        return;
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => {
          reader.readEntries(async (entries) => {
            if (!entries.length) {
              resolve(all);
              return;
            }
            for (const child of entries) {
              // Skip hidden / system junk from Finder drops.
              if (child.name.startsWith(".")) continue;
              const files = await collectFromEntry(child);
              all.push(...files);
            }
            readBatch();
          }, () => resolve(all));
        };
        readBatch();
        return;
      }
      resolve([]);
    });

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;

    const items = e.dataTransfer?.items;
    if (items?.length) {
      const entries = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry =
          item.webkitGetAsEntry?.() || item.getAsEntry?.() || null;
        if (entry) entries.push(entry);
      }
      if (entries.length) {
        const files = [];
        for (const entry of entries) {
          files.push(...(await collectFromEntry(entry)));
        }
        const csv = files.find((f) => /\.csv$/i.test(f.name));
        const zips = files.filter((f) => isZipFile(f));
        const videos = files.filter((f) => isVideoFile(f));
        if (csv) await ingestCsvFile(csv);
        if (zips.length) {
          // One zip is the usual case; if several, merge videos from all.
          const extracted = [];
          for (const zip of zips) {
            setUnzipping(true);
            try {
              extracted.push(...(await extractVideosFromZip(zip)));
            } catch (err) {
              onError?.(err.message || `Failed to open zip: ${zip.name}`);
            } finally {
              setUnzipping(false);
            }
          }
          if (extracted.length) {
            ingestVideoFiles(
              extracted,
              zips.length === 1 ? zips[0].name : `${zips.length} zip files`
            );
          }
        } else if (videos.length) {
          ingestVideoFiles(videos);
        }
        if (!csv && !zips.length && !videos.length) {
          onError?.(
            "Drop a .csv, a .zip of videos, and/or a folder of MP4/MOV/WebM files."
          );
        }
        return;
      }
    }

    const files = Array.from(e.dataTransfer?.files || []);
    const csv = files.find((f) => /\.csv$/i.test(f.name));
    const zip = files.find((f) => isZipFile(f));
    const videos = files.filter((f) => isVideoFile(f));
    if (csv) await ingestCsvFile(csv);
    if (zip) await ingestZipFile(zip);
    else if (videos.length) ingestVideoFiles(videos);
  };

  const paired = useMemo(() => {
    const auto = autoAssignVideos(csvRows, videoFiles);
    const filesByName = new Map();
    for (const f of videoFiles) {
      if (!filesByName.has(f.name)) filesByName.set(f.name, f);
    }

    return csvRows.map((row) => {
      let file = null;
      let matchSource = null;
      const hasOverride = Object.prototype.hasOwnProperty.call(
        videoOverrides,
        row.id
      );
      if (hasOverride) {
        const overrideName = videoOverrides[row.id];
        if (overrideName) {
          file = filesByName.get(overrideName) || null;
          matchSource = file ? "manual" : null;
        }
      } else if (auto.has(row.id)) {
        file = auto.get(row.id).file;
        matchSource = "auto";
      }
      const state = rowState[row.id] || { status: "idle", progress: 0, error: null };
      return { ...row, file, matchSource, state };
    });
  }, [csvRows, videoFiles, videoOverrides, rowState]);

  const matched = useMemo(() => paired.filter((r) => r.file), [paired]);
  const unmatchedCsv = useMemo(() => paired.filter((r) => !r.file), [paired]);

  const orphanVideos = useMemo(() => {
    if (csvRows.length === 0) return [];
    const claimed = new Set(matched.map((r) => r.file).filter(Boolean));
    return videoFiles.filter((f) => !claimed.has(f));
  }, [csvRows.length, matched, videoFiles]);

  const videoCount = videoFiles.length;

  const readyToUpload = matched.filter(
    (r) => r.state.status !== "done" && r.state.status !== "uploading"
  );

  const handleCsvPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await ingestCsvFile(file);
  };

  const handleFolderPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    ingestVideoFiles(files);
  };

  const handleZipPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await ingestZipFile(file);
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "winners-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearBulk = () => {
    if (uploading) return;
    setCsvRows([]);
    setCsvName("");
    setCsvWarnings([]);
    setVideoFiles([]);
    setFolderLabel("");
    setVideoOverrides({});
    setRowState({});
    setOverall({ done: 0, total: 0, current: "" });
  };

  const resolveAwardByName = async (awardName, cache) => {
    const name = (awardName || "").trim();
    if (!name) return null;
    const lower = name.toLowerCase();
    if (cache.has(lower)) return cache.get(lower);

    const existing = awards.find(
      (a) => (a.name || "").trim().toLowerCase() === lower
    );
    if (existing) {
      cache.set(lower, existing.id);
      return existing.id;
    }

    const created = await apiFetch("/api/admin/awards", {
      method: "POST",
      body: JSON.stringify({ name, is_active: true }),
    });
    if (!created?.id) throw new Error(`Failed to create award "${name}".`);
    onAwardsChange?.(created);
    cache.set(lower, created.id);
    return created.id;
  };

  const handleBulkUpload = async () => {
    if (disabled || uploading || unzipping) return;
    if (readyToUpload.length === 0) {
      onError?.("No matched CSV rows ready to upload. Check filenames.");
      return;
    }

    setUploading(true);
    const awardCache = new Map();
    let ok = 0;
    let fail = 0;
    const queue = readyToUpload;
    setOverall({ done: 0, total: queue.length, current: "" });

    for (let i = 0; i < queue.length; i++) {
      const row = queue[i];
      setOverall({ done: i, total: queue.length, current: row.title });
      setRowState((prev) => ({
        ...prev,
        [row.id]: { status: "uploading", progress: 0, error: null },
      }));

      try {
        if (!winnerMetaReady && row.award) {
          // Still upload; year/award apply after migration.
        }
        const awardId = winnerMetaReady
          ? await resolveAwardByName(row.award, awardCache)
          : null;

        const { pitchId, uploadUrl } = await apiFetch("/api/admin/seed-pitches", {
          method: "POST",
          body: JSON.stringify({
            title: row.title,
            name: row.name,
            description: row.description || null,
            winnerYear: row.year,
            awardId,
          }),
        });
        if (!uploadUrl) throw new Error("Server did not return a Mux upload URL.");

        await uploadToMux(uploadUrl, row.file, (pct) => {
          setRowState((prev) => ({
            ...prev,
            [row.id]: { status: "uploading", progress: pct, error: null },
          }));
        });

        onPitchCreated?.({
          id: pitchId,
          title: row.title,
          name: row.name,
          description: row.description || null,
          winner_year: row.year,
          winner_award_id: awardId,
          winner_award:
            awardId && row.award
              ? { id: awardId, name: row.award, sort_order: null }
              : null,
          mux_status: "processing",
          mux_playback_id: null,
          mux_asset_id: null,
          mux_error: null,
          created_at: new Date().toISOString(),
          is_seed: true,
        });

        setRowState((prev) => ({
          ...prev,
          [row.id]: { status: "done", progress: 100, error: null },
        }));
        ok += 1;
      } catch (err) {
        fail += 1;
        setRowState((prev) => ({
          ...prev,
          [row.id]: {
            status: "error",
            progress: 0,
            error: err.message || "Upload failed",
          },
        }));
      }
    }

    setOverall({ done: queue.length, total: queue.length, current: "" });
    setUploading(false);

    if (fail === 0) {
      onSuccess?.(
        `Bulk upload complete — ${ok} past winner${ok === 1 ? "" : "s"} sent to Mux.`
      );
    } else {
      onError?.(
        `Bulk upload finished with ${ok} success${ok === 1 ? "" : "es"} and ${fail} failure${fail === 1 ? "" : "s"}.`
      );
    }
  };

  const busy = disabled || uploading || unzipping;

  return (
    <div
      className="rounded-xl p-4 mb-4 space-y-3"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Bulk upload from CSV</h3>
          <p className="text-xs text-white/40 mt-0.5 max-w-xl">
            Accepts the 10KP awards export (Title, Submitter First/Last Name,
            Award, Gallery Link, …) or a simple{" "}
            <code className="text-[10px] text-white/55">title, name, year, award, filename</code>{" "}
            template. Pair with a zip of videos — we match on title, submitter
            name, or gallery id. Use the Video dropdown for anything still unmatched.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadSample}
          disabled={busy}
          className="text-[11px] font-semibold text-maize hover:underline disabled:opacity-40"
        >
          Download CSV template
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleCsvPick}
          disabled={busy}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFolderPick}
          disabled={busy}
          {...{ webkitdirectory: "", directory: "" }}
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={handleZipPick}
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => csvInputRef.current?.click()}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white/80 hover:text-white transition-colors disabled:opacity-40"
          style={inputStyle}
        >
          {csvName ? "Replace CSV" : "Upload CSV"}
        </button>
        <button
          type="button"
          onClick={() => zipInputRef.current?.click()}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white/80 hover:text-white transition-colors disabled:opacity-40"
          style={inputStyle}
        >
          {folderLabel && /\.zip$/i.test(folderLabel)
            ? "Replace ZIP"
            : "Upload video ZIP"}
        </button>
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white/80 hover:text-white transition-colors disabled:opacity-40"
          style={inputStyle}
        >
          {folderLabel && !/\.zip$/i.test(folderLabel)
            ? "Replace folder"
            : "Choose video folder"}
        </button>
        {(csvRows.length > 0 || videoCount > 0) && (
          <button
            type="button"
            onClick={clearBulk}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={handleDrop}
        className="rounded-lg px-4 py-5 text-center text-xs transition-colors"
        style={{
          border: `1px dashed ${
            dragOver ? "rgba(255,203,5,0.7)" : "rgba(255,255,255,0.15)"
          }`,
          background: dragOver
            ? "rgba(255,203,5,0.08)"
            : "rgba(255,255,255,0.02)",
          color: "rgba(255,255,255,0.45)",
          pointerEvents: busy ? "none" : "auto",
          opacity: busy ? 0.5 : 1,
        }}
      >
        Drop a CSV and a video ZIP (or folder) here
      </div>

      {unzipping && (
        <p className="text-[11px] text-maize truncate">
          {unzipLabel || "Extracting zip…"}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45">
        {csvName && (
          <span>
            CSV: <span className="text-white/70">{csvName}</span> ({csvRows.length}{" "}
            rows
            {csvWarnings.length ? `, ${csvWarnings.length} skipped` : ""})
          </span>
        )}
        {folderLabel && (
          <span>
            Folder: <span className="text-white/70">{folderLabel}</span> (
            {videoCount} videos)
          </span>
        )}
        {csvRows.length > 0 && videoCount > 0 && (
          <span>
            Matched:{" "}
            <span className="text-green-400">{matched.length}</span>
            {unmatchedCsv.length > 0 && (
              <>
                {" · "}Missing video:{" "}
                <span className="text-amber-400">{unmatchedCsv.length}</span>
              </>
            )}
            {orphanVideos.length > 0 && (
              <>
                {" · "}Unlisted video:{" "}
                <span className="text-amber-400">{orphanVideos.length}</span>
              </>
            )}
          </span>
        )}
      </div>

      {paired.length > 0 && (
        <div
          className="rounded-lg overflow-hidden max-h-72 overflow-y-auto"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <table className="w-full text-left text-xs">
            <thead
              className="sticky top-0 text-[10px] uppercase tracking-wider text-white/40"
              style={{ background: "rgba(11,26,59,0.95)" }}
            >
              <tr>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Year</th>
                <th className="px-3 py-2 font-semibold">Award</th>
                <th className="px-3 py-2 font-semibold">Video</th>
              </tr>
            </thead>
            <tbody>
              {paired.map((row) => {
                const st = row.state.status;
                let statusLabel = "No video";
                let statusColor = "#fbbf24";
                if (st === "done") {
                  statusLabel = "Done";
                  statusColor = "#4ade80";
                } else if (st === "uploading") {
                  statusLabel = `${row.state.progress}%`;
                  statusColor = "#FFCB05";
                } else if (st === "error") {
                  statusLabel = "Error";
                  statusColor = "#f87171";
                } else if (row.file) {
                  statusLabel = row.matchSource === "manual" ? "Picked" : "Ready";
                  statusColor = "#4ade80";
                }
                const hasOverride = Object.prototype.hasOwnProperty.call(
                  videoOverrides,
                  row.id
                );
                const selectValue = hasOverride
                  ? videoOverrides[row.id] || ""
                  : row.file?.name || "";
                return (
                  <tr
                    key={row.id}
                    style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span style={{ color: statusColor }}>{statusLabel}</span>
                      {st === "error" && row.state.error && (
                        <p className="text-[10px] text-red-400/80 mt-0.5 max-w-[140px] truncate" title={row.state.error}>
                          {row.state.error}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-white/85 max-w-[140px] truncate">
                      {row.title}
                    </td>
                    <td className="px-3 py-2 text-white/60 max-w-[100px] truncate">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-white/60">{row.year ?? "—"}</td>
                    <td className="px-3 py-2 text-white/60 max-w-[100px] truncate">
                      {row.award || "—"}
                    </td>
                    <td className="px-3 py-2 min-w-[180px]">
                      {videoFiles.length === 0 ? (
                        <span className="text-white/35 text-[10px]">
                          Upload a zip first
                        </span>
                      ) : (
                        <select
                          value={selectValue}
                          disabled={busy || st === "done" || st === "uploading"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVideoOverrides((prev) => ({
                              ...prev,
                              [row.id]: val,
                            }));
                          }}
                          className="w-full max-w-[220px] px-1.5 py-1 rounded text-[10px] text-white focus:outline-none focus:border-maize"
                          style={inputStyle}
                          title={selectValue || "Select video file"}
                        >
                          <option value="">Select video…</option>
                          {videoFiles.map((f) => (
                            <option key={`${row.id}-${f.name}-${f.size}`} value={f.name}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unmatchedCsv.length > 0 && videoFiles.length > 0 && (
        <p className="text-[11px] text-amber-400/90">
          {unmatchedCsv.length} row{unmatchedCsv.length === 1 ? "" : "s"} still
          need a video — pick a file in the Video column (zip names like{" "}
          <code className="text-[10px]">video….mp4</code> won&apos;t auto-match).
        </p>
      )}

      {orphanVideos.length > 0 && unmatchedCsv.length === 0 && (
        <p className="text-[11px] text-white/35">
          Unused videos:{" "}
          {orphanVideos
            .slice(0, 5)
            .map((f) => f.name)
            .join(", ")}
          {orphanVideos.length > 5 ? ` (+${orphanVideos.length - 5} more)` : ""}
        </p>
      )}

      {uploading && overall.total > 0 && (
        <p className="text-[11px] text-white/40">
          Uploading {overall.done + 1} of {overall.total}
          {overall.current ? ` — ${overall.current}` : ""}
        </p>
      )}

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleBulkUpload}
          disabled={busy || readyToUpload.length === 0}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{ background: "#FFCB05" }}
        >
          {uploading
            ? `Uploading… ${overall.done}/${overall.total}`
            : `Upload ${readyToUpload.length || ""} matched winner${
                readyToUpload.length === 1 ? "" : "s"
              }`.replace(/\s+/g, " ").trim()}
        </button>
      </div>
    </div>
  );
}
