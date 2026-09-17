"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { supabase } from "../../lib/supabase";
import { STEPS, COACH_HISTORY, emptyIdeateData, stepReady, furthestUnlocked } from "../../lib/ideate/curriculum";
import { Icon } from "../../components/ideate/art";
import { stageVars } from "../../components/ideate/theme";
import { GLASS, PrimaryButton, GhostButton } from "../../components/ideate/ui";
import { STAGE_VIEWS } from "../../components/ideate/stages";
import {
  Backdrop,
  StageHero,
  JourneyRail,
  MobileStepper,
  IdeaBoard,
  BoardSheet,
  BoardButton,
  Intro,
  Summary,
} from "../../components/ideate/shell";

// ─── Plumbing ──────────────────────────────────────────────────────────

let latestToken = null;

async function authedFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  latestToken = session?.access_token || null;
  return fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(latestToken ? { Authorization: `Bearer ${latestToken}` } : {}),
      ...(options.headers || {}),
    },
  });
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function SaveStatus({ state, onRetry }) {
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-300 hover:text-red-200">
        <Icon name="warning" className="w-3.5 h-3.5" /> Not saved · Retry
      </button>
    );
  }
  if (state === "idle") return null;
  const saving = state === "pending" || state === "saving";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40">
      <span className={`w-1.5 h-1.5 rounded-full ${saving ? "animate-pulse" : ""}`} style={{ background: saving ? "rgba(255,255,255,0.5)" : "#34D399" }} />
      {saving ? "Saving…" : "Saved"}
    </span>
  );
}

// ─── Workspace ─────────────────────────────────────────────────────────

function IdeateWorkspace() {
  const [data, setData] = useState(null);
  const [step, setStep] = useState(0);
  const [view, setView] = useState("loading"); // loading | intro | steps | summary | error
  const [loadError, setLoadError] = useState("");
  const [usage, setUsage] = useState(null);
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const [coachBusy, setCoachBusy] = useState(null);
  const [coachErrors, setCoachErrors] = useState({});
  const [boardOpen, setBoardOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const dirty = useRef(false);
  const saveChain = useRef(Promise.resolve());
  const latest = useRef({ data: null, step: 0, completed: false });
  const stepperRef = useRef(null);

  const allDone = useMemo(() => Boolean(data) && STEPS.every((s) => stepReady(s.id, data).ok), [data]);
  const furthest = useMemo(() => (data ? furthestUnlocked(data) : 0), [data]);
  latest.current = { data, step, completed: allDone };

  // Keep the active step pill visible on narrow screens.
  useEffect(() => {
    const nav = stepperRef.current;
    const el = nav?.querySelector('[aria-current="step"]');
    if (!el || !nav) return;
    const left = el.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [step, view]);

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/ideate/session");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not load your saved work.");
        if (cancelled) return;
        setUsage(json.usage || null);
        if (json.session) {
          const d = json.session.data;
          setData(d);
          setStep(Math.min(json.session.currentStep, furthestUnlocked(d)));
          const done = STEPS.every((s) => stepReady(s.id, d).ok);
          setView(json.session.completedAt && done ? "summary" : "steps");
          setSaveState("saved");
        } else {
          setData(emptyIdeateData());
          setView("intro");
        }
      } catch (err) {
        if (!cancelled) { setLoadError(err.message); setView("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save — serialised, so an older snapshot can never land after a newer one.
  const saveNow = useCallback(() => {
    const snapshot = JSON.stringify({
      data: latest.current.data,
      currentStep: latest.current.step,
      completed: latest.current.completed,
    });
    dirty.current = false;
    setSaveState("saving");
    saveChain.current = saveChain.current.then(async () => {
      try {
        const res = await authedFetch("/api/ideate/session", { method: "PUT", body: snapshot });
        if (!res.ok) throw new Error("save failed");
        if (!dirty.current) setSaveState("saved");
      } catch {
        dirty.current = true;
        setSaveState("error");
      }
    });
  }, []);

  useEffect(() => {
    if (!data || !dirty.current) return undefined;
    setSaveState("pending");
    const t = setTimeout(saveNow, 900);
    return () => clearTimeout(t);
  }, [data, step, allDone, saveNow]);

  // Last-chance save when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== "hidden" || !dirty.current || !latest.current.data || !latestToken) return;
      dirty.current = false;
      fetch("/api/ideate/session", {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${latestToken}` },
        body: JSON.stringify({ data: latest.current.data, currentStep: latest.current.step, completed: latest.current.completed }),
      }).catch(() => { dirty.current = true; });
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  const update = useCallback((mutate) => {
    dirty.current = true;
    setData((prev) => {
      const next = clone(prev);
      mutate(next);
      return next;
    });
  }, []);

  const scrollToTop = () => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goTo = (i) => {
    if (i < 0 || i > furthest) return;
    dirty.current = true;
    setStep(i);
    setView("steps");
    setBoardOpen(false);
    scrollToTop();
  };

  // Ask the coach. Returns { reply, error } and never throws.
  const askCoach = useCallback(async (mode) => {
    setCoachBusy(mode);
    try {
      const res = await authedFetch("/api/ideate/coach", {
        method: "POST",
        body: JSON.stringify({ mode, data: latest.current.data }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.usage) setUsage(json.usage);
      if (!res.ok) return { reply: null, error: json.error || "The coach couldn't answer just now." };
      return { reply: json.reply, error: "" };
    } catch {
      return { reply: null, error: "The coach couldn't answer just now." };
    } finally {
      setCoachBusy(null);
    }
  }, []);

  const askAndRecord = useCallback(async (mode, stepId) => {
    setCoachErrors((e) => ({ ...e, [stepId]: "" }));
    const { reply, error } = await askCoach(mode);
    if (!reply) {
      setCoachErrors((e) => ({ ...e, [stepId]: error }));
      return;
    }
    update((x) => { x.coach[stepId] = [...(x.coach[stepId] || []), reply].slice(-COACH_HISTORY); });
  }, [askCoach, update]);

  const reset = async () => {
    try {
      const res = await authedFetch("/api/ideate/session", { method: "DELETE" });
      if (!res.ok) throw new Error();
      dirty.current = false;
      setData(emptyIdeateData());
      setStep(0);
      setSaveState("idle");
      setCelebrate(false);
      setView("intro");
      scrollToTop();
    } catch {
      setSaveState("error");
    }
  };

  const finish = () => {
    dirty.current = true;
    setCelebrate(true);
    setView("summary");
    saveNow();
    scrollToTop();
  };

  const closeBoard = useCallback(() => setBoardOpen(false), []);

  const current = STEPS[step];
  const StageView = STAGE_VIEWS[current.id];
  const ownReady = data ? stepReady(current.id, data) : { ok: false };
  // An earlier step can fall back to incomplete if the student edits it later.
  const ready = ownReady.ok && step + 1 > furthest && step < STEPS.length - 1
    ? { ok: false, hint: `Finish ${STEPS[furthest].label} first.` }
    : ownReady;
  const isLast = step === STEPS.length - 1;
  const themeStage = view === "steps" ? current.id : view === "summary" ? "pitch" : "spark";
  const saveSlot = <SaveStatus state={saveState} onRetry={saveNow} />;

  return (
    <div className="ideate-root relative min-h-[calc(100vh-5rem)]" style={stageVars(themeStage)}>
      <Backdrop stageId={themeStage} />

      <div className="relative z-10 max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-28 lg:pb-16">
        {view === "loading" && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-sm text-white/50">
            <span className="ideate-typing flex gap-1.5"><span /><span /><span /></span>
            Loading your workspace…
          </div>
        )}

        {view === "error" && (
          <div className="max-w-md mx-auto mt-20 rounded-3xl p-8 text-center" style={GLASS}>
            <Icon name="warning" className="w-8 h-8 mx-auto text-red-300" />
            <p className="text-sm text-red-200 mt-3">{loadError}</p>
            <GhostButton className="mt-5" onClick={() => window.location.reload()}>Try again</GhostButton>
          </div>
        )}

        {view === "intro" && data && <Intro onStart={() => { setView("steps"); scrollToTop(); }} />}

        {view === "summary" && data && (
          <Summary data={data} celebrate={celebrate} onEdit={() => goTo(STEPS.length - 1)} onReset={reset} />
        )}

        {view === "steps" && data && (
          <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)] lg:gap-8 xl:gap-12">
            <aside className="hidden lg:block">
              <div className="sticky top-[104px] max-h-[calc(100dvh-128px)] overflow-y-auto no-scrollbar space-y-8 pb-6">
                <JourneyRail data={data} step={step} furthest={furthest} goTo={goTo} />
                <div className="pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <IdeaBoard data={data} />
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <MobileStepper data={data} step={step} furthest={furthest} goTo={goTo} navRef={stepperRef} />
              <StageHero step={step} saveSlot={saveSlot} />

              <section key={current.id} className="ideate-rise rounded-3xl p-4 sm:p-8 lg:p-10" style={{ ...GLASS, animationDelay: "80ms" }}>
                <StageView
                  data={data}
                  update={update}
                  goTo={goTo}
                  askCoach={askCoach}
                  coachProps={{
                    data,
                    usage,
                    busyMode: coachBusy,
                    error: coachErrors[current.id],
                    replies: data.coach[current.id] || [],
                    onAsk: (mode) => askAndRecord(mode, current.id),
                  }}
                />

                <div className="mt-12 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  {!ready.ok && ready.hint && (
                    <p className="flex items-center justify-end gap-1.5 text-xs text-white/45 mb-3 sm:hidden">
                      <Icon name="lock" className="w-3.5 h-3.5" /> {ready.hint}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <GhostButton onClick={() => goTo(step - 1)} disabled={step === 0}>← Back</GhostButton>
                    <div className="flex items-center gap-4">
                      {!ready.ok && ready.hint && (
                        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/45">
                          <Icon name="lock" className="w-3.5 h-3.5" /> {ready.hint}
                        </span>
                      )}
                      {isLast ? (
                        <PrimaryButton disabled={!allDone} onClick={finish}>
                          See my idea card <Icon name="star" className="w-4 h-4" strokeWidth={2.4} />
                        </PrimaryButton>
                      ) : (
                        <PrimaryButton disabled={!ready.ok} onClick={() => goTo(step + 1)}>
                          Next →
                        </PrimaryButton>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {view === "steps" && data && (
        <>
          <BoardButton data={data} onOpen={() => setBoardOpen(true)} />
          <BoardSheet data={data} open={boardOpen} onClose={closeBoard} />
        </>
      )}
    </div>
  );
}

export default function IdeatePage() {
  return (
    <ProtectedRoute returnTo="/ideate">
      <IdeateWorkspace />
    </ProtectedRoute>
  );
}
