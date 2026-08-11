"use client";

import Link from "next/link";
import PageBackground from "../../components/PageBackground";
import rulesBg from "../../public/rules_bg.png";

function SectionCard({ title, children }) {
  return (
    <section
      className="rounded-2xl p-6 sm:p-8"
      style={{
        background: "rgba(11,26,59,0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="h-6 w-1 rounded-full"
          style={{ background: "#F2B517" }}
        />
        <h2 className="text-white text-xl sm:text-2xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      <div className="space-y-4 text-white/80 leading-relaxed text-sm sm:text-base">
        {children}
      </div>
    </section>
  );
}

function Item({ label, children }) {
  return (
    <div className="flex gap-3">
      <span
        className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ background: "#F2B517" }}
      />
      <p>
        <span className="font-semibold text-white">{label}:</span>{" "}
        <span className="text-white/75">{children}</span>
      </p>
    </div>
  );
}

function NumberedItem({ n, label, children }) {
  return (
    <div className="flex gap-3">
      <span
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-black"
        style={{ background: "#F2B517" }}
      >
        {n}
      </span>
      <p>
        <span className="font-semibold text-white">{label}:</span>{" "}
        <span className="text-white/75">{children}</span>
      </p>
    </div>
  );
}

export default function RulesPage() {
  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden">
      <PageBackground src={rulesBg} priority quality={72} />
      {/* Readability overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(11,26,59,0.55) 0%, rgba(11,26,59,0.75) 60%, rgba(11,26,59,0.9) 100%)",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 lg:px-10 py-10 sm:py-14 lg:py-16">
        {/* Header */}
        <header className="mb-10 sm:mb-14">
          <p
            className="text-xs sm:text-sm uppercase tracking-[0.28em] font-semibold mb-3"
            style={{ color: "#F2B517" }}
          >
            10,000 Pitches — 2026
          </p>
          <h1
            className="font-bold text-white tracking-tight leading-[1.05]"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            Awards, Rules{" "}
            <span style={{ color: "#F2B517" }}>and Guidelines</span>
          </h1>
          <p className="mt-5 text-white/75 text-base sm:text-lg max-w-2xl leading-relaxed">
            The 10,000 Pitches (10KP) competition, co-hosted by the Center for
            Entrepreneurship (CFE) and the Zell Lurie Institute (ZLI), invites
            the U-M community to share creative, impactful ideas through
            60-second video pitches.
          </p>
        </header>

        <div className="space-y-6 sm:space-y-8">
          <SectionCard title="Who Can Enter">
            <Item label="Campus Eligibility">
              Anyone with an active @umich.edu email address can participate,
              including U-M students, faculty, staff, and alumni across the Ann
              Arbor, Dearborn, and Flint campuses.
            </Item>
            <Item label="Team Submissions">
              Teams of any size are welcome, provided at least one member
              submits using an active @umich.edu email address.
            </Item>
            <Item label="Multiple Entries">
              Participants may submit as many unique pitch ideas as they like.
              You&rsquo;re highly encouraged to submit multiple pitches. All
              pitches submitted during that week are eligible for the weekly
              raffles.
            </Item>
            <Item label="Prize Eligibility">
              Most prizes are dedicated to student submissions, but it is
              expected that there will be a set of awards for staff, faculty,
              and alumni.
            </Item>
          </SectionCard>

          <SectionCard title="Pitch Video Guidelines">
            <Item label="Length & Format">
              You may submit text-only pitches, audio-only pitches, or video
              pitches. Pitches should be 60 seconds or less, but that is not a
              hard cutoff. No slide decks or formal business plans are required,
              but feel free to use them or be creative in other ways.
            </Item>
            <div>
              <p className="font-semibold text-white mb-3">
                Core Elements to Include:
              </p>
              <div className="space-y-3 pl-1">
                <NumberedItem n="1" label="Introduction">
                  State your name, role (student, alum, faculty, staff), and
                  school/college affiliation.
                </NumberedItem>
                <NumberedItem n="2" label="Problem Statement">
                  Explain the challenge you are addressing and who it affects.
                </NumberedItem>
                <NumberedItem n="3" label="Solution & Impact">
                  Describe your idea/solution, who it is built for, and why it
                  is impactful or innovative.
                </NumberedItem>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Public Gallery & Terms">
            <Item label="Public Gallery">
              Submissions are featured in an{" "}
              <Link
                href="/gallery"
                className="underline underline-offset-4 transition-colors"
                style={{ color: "#F2B517" }}
              >
                open gallery
              </Link>{" "}
              where the community can view, share, and vote on pitches.
            </Item>
            <Item label="Confidentiality">
              Submissions are public; do not include confidential or proprietary
              information in your video.
            </Item>
            <Item label="Usage Rights">
              By submitting, participants grant U-M permission to feature pitch
              videos for promotional, educational, and program development
              purposes.
            </Item>
          </SectionCard>

          <SectionCard title="Pitch Support">
            <Item label="Maizey AI Pitch Coach">
              Participants can use{" "}
              <a
                href="https://maizey.umich.edu"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 transition-colors"
                style={{ color: "#F2B517" }}
              >
                Maizey
              </a>
              , U-M&rsquo;s custom AI pitch coach, to brainstorm, draft, and
              refine their 60-second video pitches prior to submission.
            </Item>
          </SectionCard>

          <SectionCard title="Awards">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: "rgba(242,181,23,0.15)",
                  color: "#F2B517",
                  border: "1px solid rgba(242,181,23,0.35)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#F2B517" }}
                />
                Coming Soon
              </span>
              <span className="text-white/70 text-sm">
                Prize details will be announced shortly.
              </span>
            </div>
          </SectionCard>
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Link
            href="/intake"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 text-black hover:shadow-lg hover:-translate-y-0.5"
            style={{ background: "#F2B517" }}
          >
            Submit Your Pitch
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </Link>
          <Link
            href="/gallery"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-xl transition-all duration-200"
            style={{
              border: "2px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            View Gallery
          </Link>
        </div>
      </div>
    </div>
  );
}
