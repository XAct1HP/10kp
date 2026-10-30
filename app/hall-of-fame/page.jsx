"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageBackground from "../../components/PageBackground";
import galleryHero from "../../public/gallery_hero.png";
import "./hall-of-fame.css";

const MAIZE = "#FFCB05";
const NAVY = "#0B1A3B";

const CONFETTI_COLORS = [
  "#FFCB05",
  "#FFE17A",
  "#E8A84C",
  "#FFFFFF",
  "#F5F5F5",
  "#7EB6FF",
  "#FF8A00",
];

function Confetti({ burstKey = 0 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => {
        const side = (i + burstKey) % 2 === 0 ? "left" : "right";
        const salt = burstKey * 17;
        return {
          side,
          top: `${8 + ((i * 17 + salt) % 72)}%`,
          color: CONFETTI_COLORS[(i + burstKey) % CONFETTI_COLORS.length],
          delay: `${((i * 29 + salt) % 90) / 100}s`,
          dur: `${2.4 + ((i * 13) % 20) / 10}s`,
          // Burst toward center, then fall — distance in vw so it scales.
          dx: `${28 + ((i * 23 + salt) % 48)}vw`,
          dy: `${-8 + ((i * 41 + salt) % 70)}vh`,
          spin: `${360 + ((i * 71 + salt) % 540)}deg`,
          round: i % 4 === 0,
          wide: i % 5 === 0,
        };
      }),
    [burstKey]
  );

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`hof-confetti hof-confetti--${p.side}`}
          style={{
            top: p.top,
            background: p.color,
            borderRadius: p.round ? "9999px" : "2px",
            width: p.round ? 9 : p.wide ? 12 : 8,
            height: p.round ? 9 : p.wide ? 8 : 14,
            "--delay": p.delay,
            "--dur": p.dur,
            "--dx": p.dx,
            "--dy": p.dy,
            "--spin": p.spin,
          }}
        />
      ))}
    </div>
  );
}

function getPitchType(pitch) {
  if (!pitch) return "unknown";
  if (pitch.file_type === "audio") return "audio";
  if (pitch.file_type === "video") return "video";
  if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(pitch.file_name || "")) return "audio";
  if (pitch.mux_playback_id) return "video";
  return "text";
}

function getPitchThumbnail(pitch, defaults = {}) {
  if (!pitch) return null;
  if (pitch.thumbnail_path) return pitch.thumbnail_path;
  if (pitch.mux_playback_id && getPitchType(pitch) === "video") {
    return `https://image.mux.com/${pitch.mux_playback_id}/thumbnail.jpg?time=1&width=640&height=360&fit_mode=smartcrop`;
  }
  if (getPitchType(pitch) === "audio") {
    return defaults.audioThumbnail || null;
  }
  return defaults.textThumbnail || null;
}

function WinnerCard({ winner, defaults, index }) {
  const thumb = getPitchThumbnail(winner, defaults);
  const galleryHref = `/gallery?pitch=${encodeURIComponent(winner.id)}`;
  const type = getPitchType(winner);

  return (
    <Link
      href={galleryHref}
      className="hof-card hof-rise group relative block rounded-3xl overflow-hidden text-left"
      style={{
        animationDelay: `${Math.min(index, 12) * 55}ms`,
        background:
          "linear-gradient(165deg, rgba(22,40,82,0.92) 0%, rgba(11,26,59,0.96) 100%)",
        border: "1px solid rgba(255,203,5,0.22)",
        boxShadow:
          "0 18px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Award ribbon */}
      <div className="absolute top-0 left-0 right-0 z-10 flex justify-center pt-0">
        <div
          className="hof-ribbon px-4 py-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em] text-center max-w-[90%] truncate"
          style={{
            color: NAVY,
            clipPath: "polygon(0 0, 100% 0, 96% 100%, 4% 100%)",
            boxShadow: "0 6px 16px rgba(255,203,5,0.25)",
          }}
          title={winner.award?.name || "Winner"}
        >
          {winner.award?.name || "Winner"}
        </div>
      </div>

      {/* Thumbnail */}
      <div
        className="hof-thumb relative aspect-[16/10] overflow-hidden"
        style={{ background: "rgba(0,0,0,0.35)" }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs uppercase tracking-[0.2em] text-white/35">
              {type}
            </span>
          </div>
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(11,26,59,0.95) 0%, rgba(11,26,59,0.35) 42%, transparent 70%)",
          }}
        />
        {/* Soft maize corner glow */}
        <div
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none opacity-40 group-hover:opacity-70 transition-opacity"
          style={{
            background:
              "radial-gradient(circle, rgba(255,203,5,0.35), transparent 70%)",
          }}
        />
      </div>

      {/* Copy */}
      <div className="relative px-5 pb-5 pt-1 -mt-8">
        {winner.award?.prize && (
          <p
            className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2 truncate"
            style={{ color: MAIZE }}
          >
            {winner.award.prize}
          </p>
        )}
        <h2
          className="font-black text-white tracking-tight leading-snug line-clamp-2"
          style={{ fontSize: "clamp(1.05rem, 2vw, 1.35rem)" }}
        >
          {winner.title}
        </h2>
        <p className="mt-2 text-sm text-white/55">
          by{" "}
          <span className="font-semibold text-white/85">{winner.name}</span>
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              background: "rgba(255,203,5,0.12)",
              color: MAIZE,
              border: "1px solid rgba(255,203,5,0.3)",
            }}
          >
            {winner.award?.name || "Award"}
          </span>
          <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/70 transition-colors">
            View pitch →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function HallOfFamePage() {
  const [year, setYear] = useState(null);
  const [winners, setWinners] = useState([]);
  const [defaults, setDefaults] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bursts, setBursts] = useState([]);
  const winnersRef = useRef(null);
  const lastBurstAtRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const burstSeqRef = useRef(0);
  const winnersSeenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/hall-of-fame", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load winners.");
        if (cancelled) return;
        setYear(data.year);
        setWinners(data.winners || []);
        setDefaults(data.defaults || {});
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load winners.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fireConfetti = (force = false) => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const now = Date.now();
    // Throttle scroll bursts so the page stays readable.
    if (!force && now - lastBurstAtRef.current < 1600) return;
    lastBurstAtRef.current = now;

    burstSeqRef.current += 1;
    const id = burstSeqRef.current;
    setBursts((prev) => [...prev.slice(-2), id]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b !== id));
    }, 5200);
  };

  // First burst when the winners grid enters the viewport.
  useEffect(() => {
    if (loading || error || winners.length === 0) return undefined;
    const node = winnersRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (!winnersSeenRef.current) {
          winnersSeenRef.current = true;
          fireConfetti(true);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, error, winners.length]);

  // Keep celebrating as the viewer scrolls through the page.
  useEffect(() => {
    if (loading || error || winners.length === 0) return undefined;

    lastScrollYRef.current =
      typeof window !== "undefined" ? window.scrollY || 0 : 0;

    const onScroll = () => {
      const y = window.scrollY || 0;
      const delta = Math.abs(y - lastScrollYRef.current);
      if (delta < 140) return;
      lastScrollYRef.current = y;
      // Only celebrate while the winners section is (or was) in play —
      // once they've scrolled to it, further scrolling keeps the effect going.
      if (!winnersSeenRef.current) return;
      fireConfetti(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [loading, error, winners.length]);

  return (
    <div className="relative min-h-[calc(100vh-5rem)]">
      <PageBackground src={galleryHero} priority quality={70} objectPosition="center" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(6,14,33,0.72) 0%, rgba(11,26,59,0.88) 40%, rgba(11,26,59,0.97) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgba(255,203,5,0.18), transparent 70%)",
        }}
      />

      {bursts.map((id) => (
        <Confetti key={id} burstKey={id} />
      ))}

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-20">
        {/* Hero */}
        <header className="hof-rise text-center mb-10 sm:mb-14 mx-auto w-full">
          <p
            className="text-xs sm:text-sm uppercase tracking-[0.32em] font-bold mb-4"
            style={{ color: MAIZE }}
          >
            10,000 Pitches
          </p>
          <h1
            className="font-black text-white tracking-tight leading-none whitespace-nowrap"
            style={{
              fontSize: "clamp(0.62rem, calc((100vw - 2.5rem) / 31), 2.75rem)",
            }}
          >
            {year
              ? `Celebrating the standout pitches from the ${year} competition!`
              : "Celebrating the standout pitches from this year’s competition!"}
          </h1>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm text-white/50">
            Loading the Hall of Fame…
          </div>
        ) : error ? (
          <div
            className="max-w-lg mx-auto rounded-3xl p-8 text-center"
            style={{
              background: "rgba(11,26,59,0.7)",
              border: "1px solid rgba(248,113,113,0.35)",
            }}
          >
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        ) : winners.length === 0 ? (
          <section
            className="hof-rise max-w-lg mx-auto rounded-3xl p-8 sm:p-10 text-center"
            style={{
              background:
                "linear-gradient(180deg, rgba(16,32,68,0.72), rgba(11,26,59,0.72))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <p className="text-white/70 text-base leading-relaxed mb-8">
              Winners for {year || "this year"} haven&apos;t been announced yet.
              Check back after the awards are recorded — or browse the gallery
              in the meantime.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/gallery"
                className="inline-flex items-center justify-center px-5 py-3 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
                style={{ background: MAIZE, color: NAVY }}
              >
                View Gallery
              </Link>
              <Link
                href="/announcements"
                className="inline-flex items-center justify-center px-4 py-3 rounded-xl text-sm font-semibold text-white/75 hover:text-white hover:bg-white/5 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.14)" }}
              >
                Announcements
              </Link>
            </div>
          </section>
        ) : (
          <div
            ref={winnersRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
          >
            {winners.map((winner, index) => (
              <WinnerCard
                key={`${winner.id}-${winner.award?.id || index}`}
                winner={winner}
                defaults={defaults}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
