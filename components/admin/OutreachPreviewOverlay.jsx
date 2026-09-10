"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ─── Outreach message preview ──────────────────────────────────────
// Shows an admin exactly what an outreach email looks like on arrival:
// the inbox row (sender, subject, snippet) and the rendered email body,
// both driven straight off the composer state so they update live while
// the message is being written.
//
// The overlay is positioned `absolute inset-0` inside the Matching
// Accounts column, so it blurs the account list and outreach history
// while leaving the Community Outreach composer beside it untouched and
// editable — that is the whole point of previewing here rather than in a
// centered modal.

// The email template renders at a fixed 600px table width. Preview it at a
// realistic client width and scale it down to whatever the column can give
// us, rather than letting a 600px email overflow a 480px panel.
const FRAME_WIDTHS = { desktop: 680, mobile: 390 };

// Scrollbars are hidden site-wide; the iframe is its own document, so the
// rule has to be injected into it too.
const IFRAME_RESET = `<style>
  html, body { scrollbar-width: none; -ms-overflow-style: none; }
  html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }
</style>`;

function injectReset(html) {
  const source = String(html || "");
  if (!source) return "";
  return source.includes("</head>")
    ? source.replace("</head>", `${IFRAME_RESET}</head>`)
    : `${IFRAME_RESET}${source}`;
}

// RESEND_FROM_EMAIL may already be an RFC 5322 "Name <address>" pair, or a
// bare address that the server wraps with RESEND_FROM_NAME. Show whichever
// name the recipient will actually see.
function parseSender(fromEmail, fromName) {
  const raw = String(fromEmail || "").trim();
  const paired = raw.match(/^(.*)<([^>]+)>\s*$/);
  const address = (paired ? paired[2] : raw).trim();
  const namePart = paired ? paired[1].trim().replace(/^"|"$/g, "") : "";
  return {
    name: namePart || String(fromName || "").trim() || "10,000 Pitches",
    address: address || "not configured",
  };
}

function buildSnippet(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return "No message body yet.";
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

// Re-render the iframe once typing settles. Without this every keystroke
// swaps the document out and the preview strobes.
function useDebounced(value, delay = 200) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export default function OutreachPreviewOverlay({
  open,
  onClose,
  kind = "broadcast",
  subject,
  html,
  text,
  snippetSource,
  fromEmail,
  fromName,
  sampleRecipient,
  recipientLabel,
  warning,
}) {
  const [device, setDevice] = useState("desktop");
  const [view, setView] = useState("rendered");
  const [box, setBox] = useState({ width: 0, height: 0 });
  const stageRef = useRef(null);

  const debouncedHtml = useDebounced(html);
  const srcDoc = useMemo(() => injectReset(debouncedHtml), [debouncedHtml]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // The stage is sized by the column beside it, which changes with the
  // window and with the composer's own height — measure, don't assume.
  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      setBox({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setBox({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, [open, view]);

  if (!open) return null;

  const sender = parseSender(fromEmail, fromName);
  const displaySubject = String(subject || "").trim() || "(no subject)";
  const frameWidth = FRAME_WIDTHS[device];
  const scale = box.width ? Math.min(1, box.width / frameWidth) : 1;
  const offsetX = Math.max(0, (box.width - frameWidth * scale) / 2);
  const frameHeight = box.height ? box.height / scale : 0;
  const clockLabel = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div
      className="absolute inset-0 z-30 rounded-2xl overflow-hidden"
      style={{
        background: "rgba(6,14,33,0.62)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
      onClick={onClose}
    >
      <div
        className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "rgba(11,26,59,0.9)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 flex-shrink-0 border-b border-white/[0.06]">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-maize font-semibold">
              Live preview
            </p>
            <h2 className="text-lg font-bold text-white leading-tight">
              {kind === "winner" ? "Winner notification" : "Broadcast email"}
            </h2>
            <p className="text-xs text-white/35 mt-1">
              {recipientLabel} &middot; updates as you type
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>
              {[
                { id: "rendered", label: "HTML" },
                { id: "text", label: "Plain" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setView(option.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    view === option.id ? "bg-maize text-navy" : "text-white/45 hover:text-white/75"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {view === "rendered" && (
              <div className="hidden sm:flex rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                {[
                  { id: "desktop", label: "Desktop" },
                  { id: "mobile", label: "Phone" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDevice(option.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      device === option.id ? "bg-white/15 text-white" : "text-white/45 hover:text-white/75"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close preview"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Inbox row — what the message looks like before it is opened */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2">
            In their inbox
          </p>
          <div
            className="rounded-xl px-3.5 py-3 flex items-start gap-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-navy"
              style={{ background: "#FFCB05" }}
            >
              10
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-white truncate">{sender.name}</span>
                <span className="text-[10px] text-white/30 flex-shrink-0 tabular-nums">{clockLabel}</span>
              </div>
              <p
                className={`text-sm truncate mt-0.5 ${
                  String(subject || "").trim() ? "text-white/85 font-medium" : "text-white/30 italic"
                }`}
              >
                {displaySubject}
              </p>
              <p className="text-xs text-white/35 truncate mt-0.5">{buildSnippet(snippetSource || text)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-white/30">
            <span>
              From <span className="text-white/55">{sender.address}</span>
            </span>
            <span>
              To <span className="text-white/55">{sampleRecipient || "each recipient, individually"}</span>
            </span>
          </div>
          {warning && (
            <p className="text-[11px] text-amber-300/80 mt-2">{warning}</p>
          )}
        </div>

        {/* Body — the message itself, filling whatever height is left */}
        <div className="px-5 pb-5 flex-1 min-h-0 flex flex-col">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2 flex-shrink-0">
            {view === "rendered" ? "When they open it" : "Plain-text version"}
          </p>
          <div
            ref={stageRef}
            className="flex-1 min-h-0 rounded-xl overflow-hidden relative"
            style={{ background: "#f4f6f9", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {view === "rendered" ? (
              <div
                className="absolute top-0 left-0"
                style={{
                  width: frameWidth,
                  height: frameHeight || "100%",
                  transform: `translateX(${offsetX}px) scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                <iframe
                  title="Email preview"
                  srcDoc={srcDoc}
                  className="w-full h-full border-0"
                  // No scripts run in the preview; popups are allowed so the
                  // CTA link still opens in a new tab if the admin clicks it.
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                />
              </div>
            ) : (
              <pre className="absolute inset-0 overflow-y-auto no-scrollbar p-4 text-[13px] leading-relaxed text-navy whitespace-pre-wrap font-sans">
                {String(text || "").trim() || "Nothing to preview yet."}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
