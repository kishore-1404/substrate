"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Markdown } from "@/components/ui/markdown";
import {
  getConceptChunk,
  isOfflineStorageEnabled,
  requestPersistentStorage,
  saveConceptChunk,
  setOfflineStorageEnabled,
} from "@/lib/offline-library";
import { useSwipeToDismiss } from "@/lib/use-swipe-to-dismiss";

// Code-split the diagram renderer + its @markdy/renderer-dom dependency
// into their own chunk, only fetched when a diagram stage actually mounts —
// most stages (mental model, decision, assessment) never need it.
const MarkdyDiagram = dynamic(() => import("./markdy-diagram").then((m) => m.MarkdyDiagram), {
  ssr: false,
  loading: () => <div className="h-[380px] w-full animate-pulse rounded-xl border bg-muted shadow-sm" />,
});

interface StageRow {
  id: string;
  order: number;
  type: string;
  generatedBy: string;
  payload: unknown;
}

interface ExperienceData {
  experience: { id: string; title: string; status: string };
  stages: StageRow[];
  cached: boolean;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface VersionInfo {
  id: string;
  title: string;
  generationRequest: string | null;
  createdAt: string;
}

const UI_STEPS = [
  { key: "mental_model", label: "Mental model" },
  { key: "visualization", label: "Visualization" },
  { key: "simulation", label: "Simulation" },
  { key: "decision", label: "Decision" },
  { key: "consequence", label: "Consequence" },
  { key: "mastery", label: "Mastery" },
] as const;

const EXPLAIN_PRESETS = ["Like I'm a junior engineer", "Use a real-world analogy", "Go deeper"];

function stageByType(stages: StageRow[], type: string) {
  return stages.find((s) => s.type === type);
}

function DiagramHiddenNotice({ onShow }: { onShow: () => void }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-xl border bg-muted/40 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">Diagram hidden while the book panel is open — close it to view the diagram again.</p>
      <Button size="sm" variant="outline" onClick={onShow}>
        Close book
      </Button>
    </div>
  );
}

export function ExperiencePlayer({
  userId,
  conceptSlug,
  conceptTitle,
  sourceChunk,
  breadcrumb,
  initialData,
}: {
  userId: string;
  conceptSlug: string;
  conceptTitle: string;
  sourceChunk: string;
  breadcrumb: string;
  initialData: ExperienceData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data] = useState(initialData);
  const [step, setStepState] = useState(() => {
    const fromUrl = Number(searchParams.get("stage"));
    return Number.isInteger(fromUrl) && fromUrl >= 0 && fromUrl < UI_STEPS.length ? fromUrl : 0;
  });
  const [decision, setDecision] = useState<string | null>(null);
  const [traffic, setTraffic] = useState(30);
  const [simEngaged, setSimEngaged] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [masteryPct, setMasteryPct] = useState<number | null>(null);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [customInstruction, setCustomInstruction] = useState("");

  // Persistent split-pane, not a modal overlay — the whole point is to read
  // the book excerpt AND the generated content at the same time, side by
  // side, not context-switch into a drawer that covers one to see the other.
  const [bookOpen, setBookOpen] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [offlineEnabled, setOfflineEnabledState] = useState(true);
  const [offlineFallback, setOfflineFallback] = useState<string | null>(null);

  // Below lg, the book panel is a full overlay — Markdy's own controls
  // (speed menu, fullscreen) are portaled to <body> with a z-index far above
  // anything in this component (see @markdy/renderer-dom), so they'd render
  // on top of the book overlay no matter how we stack our own z-indexes.
  // Unmounting the diagram while the overlay covers it (mobile only — at lg+
  // the book sits beside the content, never over it) is the only reliable
  // fix short of patching the third-party control chrome.
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    setIsNarrowViewport(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsNarrowViewport(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const diagramHidden = bookOpen && isNarrowViewport;
  const bookSwipe = useSwipeToDismiss(() => openBook(false));

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatLoadedRef = useRef(false);

  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);

  // The book panel and the chat/explain sheets are all full-overlay on
  // mobile and share the same z-index tier — letting more than one be open
  // at once means two bottom sheets fighting for the same screen region.
  // Opening any one of them closes the others.
  const openBook = useCallback((next: boolean) => {
    setBookOpen(next);
    if (next) {
      setChatOpen(false);
      setExplainOpen(false);
    }
  }, []);
  const openChat = useCallback((next: boolean) => {
    setChatOpen(next);
    if (next) setBookOpen(false);
  }, []);
  const openExplain = useCallback((next: boolean) => {
    setExplainOpen(next);
    if (next) setBookOpen(false);
  }, []);

  const setStep = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(UI_STEPS.length - 1, next));
      setStepState(clamped);
      const params = new URLSearchParams(searchParams.toString());
      params.set("stage", String(clamped));
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    fetch(`/api/concepts/${conceptSlug}/experiences`)
      .then((r) => r.json())
      .then((j) => setVersions(j.versions ?? []))
      .catch(() => {});
  }, [conceptSlug]);

  // Persist the book excerpt for this concept the moment it's on the page,
  // not only when the panel opens — so a concept the learner never opens the
  // book on is still saved offline for later. Default on, toggleable below.
  useEffect(() => {
    setOfflineEnabledState(isOfflineStorageEnabled());
    void requestPersistentStorage();
  }, []);

  useEffect(() => {
    if (!offlineEnabled) return;
    if (sourceChunk) {
      void saveConceptChunk({ slug: conceptSlug, title: conceptTitle, sourceChunk }).then(() => setOfflineSaved(true));
    } else {
      // Server sent nothing (e.g. offline navigation) — fall back to
      // whatever was saved from a previous visit.
      void getConceptChunk(conceptSlug).then((cached) => {
        if (cached) setOfflineFallback(cached.sourceChunk);
      });
    }
  }, [conceptSlug, conceptTitle, sourceChunk, offlineEnabled]);

  const displayedSourceChunk = sourceChunk || offlineFallback || "";

  const { stages } = data;
  const mentalModel = stageByType(stages, "mental_model");
  const explanation = stageByType(stages, "explanation");
  const visualization = stageByType(stages, "visualization");
  const example = stageByType(stages, "example");
  const simulation = stageByType(stages, "simulation");
  const decisionStage = stageByType(stages, "decision");
  const assessment = stageByType(stages, "assessment");

  const markdyCode = (visualization?.payload as { markdy?: string })?.markdy ?? "";
  const simConfig = simulation?.payload as { minLagSeconds: number; maxLagSeconds: number } | undefined;

  const lagSeconds = useMemo(() => {
    if (!simConfig) return 0;
    return simConfig.minLagSeconds + (traffic / 100) * (simConfig.maxLagSeconds - simConfig.minLagSeconds);
  }, [simConfig, traffic]);

  const choices = (decisionStage?.payload as { choices?: { id: string; label: string; consequence: string }[] })?.choices ?? [];
  const chosenConsequence = choices.find((c) => c.id === decision)?.consequence ?? null;

  const assessmentQuestions =
    (assessment?.payload as { questions?: { id: string; prompt: string; options: { id: string; label: string }[]; correctOptionId: string }[] })
      ?.questions ?? [];

  async function submitAssessment() {
    const correct = assessmentQuestions.filter((q) => answers[q.id] === q.correctOptionId).length;
    const score = assessmentQuestions.length ? correct / assessmentQuestions.length : 0;
    const chosenChoice = choices.find((c) => c.id === decision);
    const decisionCorrect = decisionStage ? !!chosenChoice : null;

    const res = await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, experienceId: data.experience.id, assessmentScore: score, decisionCorrect, simulationEngaged: simEngaged }),
    });
    const json = await res.json();
    setMasteryPct(json.masteryPct);
  }

  function retakeAssessment() {
    setAnswers({});
    setMasteryPct(null);
  }

  async function requestExplainDifferently(request: string) {
    if (!request.trim() || explainLoading) return;
    setExplainLoading(true);
    try {
      const res = await fetch("/api/experiences/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, conceptSlug, userRequest: request }),
      });
      if (res.ok) {
        const json = await res.json();
        setExplainOpen(false);
        router.push(`/experience/${json.experienceId}`);
      }
    } finally {
      setExplainLoading(false);
    }
  }

  async function loadChat() {
    if (chatLoadedRef.current) return;
    chatLoadedRef.current = true;
    const res = await fetch(`/api/experiences/${data.experience.id}/chat?userId=${userId}`);
    const json = await res.json();
    setChatMessages((json.messages ?? []).map((m: ChatMsg) => ({ id: m.id, role: m.role, content: m.content })));
  }

  async function sendChatMessage() {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    setChatInput("");
    setChatLoading(true);
    setChatMessages((m) => [...m, { id: `optimistic-${Date.now()}`, role: "user", content: message }]);
    try {
      const res = await fetch(`/api/experiences/${data.experience.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message }),
      });
      const json = await res.json();
      if (res.ok) {
        setChatMessages((m) => [...m.filter((x) => !x.id.startsWith("optimistic-")), json.userMessage, json.assistantMessage]);
      }
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
      if (typing) {
        if (e.key === "Escape") target.blur();
        return;
      }
      if (e.key === "Escape") {
        setBookOpen(false);
        setChatOpen(false);
        setExplainOpen(false);
        return;
      }
      if (["ArrowRight", "l", "n"].includes(e.key)) setStep(step + 1);
      else if (["ArrowLeft", "h", "p"].includes(e.key)) setStep(step - 1);
      else if (/^[1-6]$/.test(e.key)) setStep(Number(e.key) - 1);
      else if (e.key === "b") openBook(!bookOpen);
      else if (e.key === "c") {
        openChat(!chatOpen);
        loadChat();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, bookOpen, chatOpen]);

  return (
    <div className="flex max-w-6xl flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1.5 truncate font-mono text-xs text-muted-foreground">{breadcrumb}</p>
            <h1 className="text-[22px] font-semibold">{data.experience.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {versions.length > 1 && (
              <div className="relative">
                <Button variant="outline" size="sm" onClick={() => setVersionMenuOpen((v) => !v)}>
                  Version ▾
                </Button>
                {versionMenuOpen && (
                  <div className="absolute right-0 z-10 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-1.5 shadow-lg">
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => router.push(`/experience/${v.id}`)}
                        className={`block w-full rounded-md px-2.5 py-2 text-left text-sm ${
                          v.id === data.experience.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        }`}
                      >
                        {v.generationRequest ?? "Original"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button variant={bookOpen ? "default" : "outline"} size="sm" onClick={() => openBook(!bookOpen)}>
              {bookOpen ? "Hide book" : "Read the book"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                openChat(true);
                loadChat();
              }}
            >
              Ask about this
            </Button>
            {data.cached && (
              <Badge className="whitespace-nowrap rounded-md bg-accent px-2.5 py-1.5 font-mono text-[11px] font-semibold text-accent-foreground hover:bg-accent">
                CACHED · INSTANT LOAD
              </Badge>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {UI_STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`flex w-[92px] shrink-0 flex-col gap-1.5 border-b-[3px] pb-2.5 text-left sm:w-auto sm:flex-1 ${
                  i === step ? "border-primary" : "border-muted"
                }`}
              >
                <span className={`font-mono text-[11px] font-semibold ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`text-xs font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
              </button>
            ))}
          </div>
          {/* Hints that the tab row scrolls further — only relevant below sm,
              where the tabs are fixed-width instead of stretching to fill. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
        </div>
        <div className="flex justify-center gap-1.5 sm:hidden">
          {UI_STEPS.map((s, i) => (
            <span key={s.key} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            {step === 0 && (
              <div className="space-y-5">
                <Markdown size="base">{(mentalModel?.payload as { text?: string })?.text ?? ""}</Markdown>
                {explanation && (
                  <Markdown size="base" className="text-muted-foreground">
                    {(explanation.payload as { text?: string })?.text ?? ""}
                  </Markdown>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                {markdyCode && (diagramHidden ? <DiagramHiddenNotice onShow={() => openBook(false)} /> : <MarkdyDiagram code={markdyCode} autoplay />)}
                {example && (
                  <Markdown size="base" className="text-muted-foreground">
                    {(example.payload as { scenario?: string })?.scenario ?? ""}
                  </Markdown>
                )}
              </div>
            )}

            {step === 2 && simConfig && (
              <div className="space-y-4">
                {markdyCode && (diagramHidden ? <DiagramHiddenNotice onShow={() => openBook(false)} /> : <MarkdyDiagram code={markdyCode} autoplay />)}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Write traffic</span>
                    <span className="font-mono">LAG: {lagSeconds.toFixed(1)}s</span>
                  </div>
                  <Slider
                    value={[traffic]}
                    max={100}
                    step={1}
                    onValueChange={(v) => {
                      const next = Array.isArray(v) ? v[0] : v;
                      setTraffic(next);
                      setSimEngaged(true);
                    }}
                  />
                </div>
              </div>
            )}

            {step === 3 && decisionStage && (
              <div className="space-y-4">
                <Markdown className="font-medium">{(decisionStage.payload as { prompt?: string })?.prompt ?? ""}</Markdown>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {choices.map((c) => (
                    <Button
                      key={c.id}
                      variant={decision === c.id ? "default" : "outline"}
                      className="h-auto flex-1 basis-64 whitespace-normal text-left"
                      onClick={() => {
                        setDecision(c.id);
                        setStep(4);
                      }}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 &&
              (chosenConsequence ? (
                <Markdown size="base">{chosenConsequence}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">Go back to the Decision stage and choose where the read should go.</p>
              ))}

            {step === 5 && (
              <div className="space-y-6">
                {masteryPct === null ? (
                  <div className="space-y-5">
                    {assessmentQuestions.map((q) => (
                      <div key={q.id} className="space-y-2">
                        <Markdown className="font-medium">{q.prompt}</Markdown>
                        <div className="flex flex-wrap gap-2">
                          {q.options.map((o) => (
                            <Button
                              key={o.id}
                              size="sm"
                              className="h-auto whitespace-normal text-left"
                              variant={answers[q.id] === o.id ? "default" : "outline"}
                              onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                            >
                              {o.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <Button disabled={Object.keys(answers).length < assessmentQuestions.length} onClick={submitAssessment}>
                      Submit
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Mastery</span>
                        <span className="font-mono">{masteryPct}%</span>
                      </div>
                      <Progress value={masteryPct} />
                    </div>
                    <p className="text-sm text-muted-foreground">Nice work — this concept is now tracked in your progress.</p>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="outline" onClick={retakeAssessment}>
                        Retake assessment
                      </Button>
                      <Button variant="outline" onClick={() => openExplain(true)}>
                        Explain differently
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="hidden text-center font-mono text-[11px] text-muted-foreground sm:block">
          ← → to navigate stages · 1–6 to jump · B for the book · C to ask a question
        </p>
      </div>

      {/* Persistent split-pane book reference at lg+ — sits beside the
          generated content instead of covering it, so both are readable
          together. Below lg there's no room for a side-by-side pane, so it
          becomes a bottom-sheet-style overlay over a backdrop instead. */}
      {bookOpen && (
        <>
          <div
            role="presentation"
            onClick={() => setBookOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          />
          <aside
            className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] w-full flex-col overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-lg lg:sticky lg:inset-auto lg:top-10 lg:z-auto lg:h-fit lg:max-h-[calc(100vh-80px)] lg:w-[360px] lg:shrink-0 lg:rounded-2xl lg:p-6"
            style={bookSwipe.dragY ? { transform: `translateY(${bookSwipe.dragY}px)` } : undefined}
          >
            <div {...bookSwipe.handlers} className="-mt-1 mb-2 flex justify-center py-1 lg:hidden">
              <div className="h-1 w-9 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">FROM THE BOOK</p>
              <button onClick={() => setBookOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close book panel">
                ×
              </button>
            </div>
            <h2 className="mb-3 text-base font-semibold">{conceptTitle}</h2>
            <Markdown size="base" className="prose-p:leading-[1.8]">
              {displayedSourceChunk || "_No source excerpt available for this concept._"}
            </Markdown>
            <div className="mt-5 flex items-center justify-between border-t pt-3">
              <span className="text-xs text-muted-foreground">
                {offlineEnabled ? (offlineSaved || offlineFallback ? "Saved for offline reading" : "Saving for offline…") : "Offline saving is off"}
              </span>
              <button
                onClick={() => {
                  const next = !offlineEnabled;
                  setOfflineEnabledState(next);
                  setOfflineStorageEnabled(next);
                  if (!next) {
                    setOfflineSaved(false);
                    setOfflineFallback(null);
                  }
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  offlineEnabled ? "bg-accent text-accent-foreground" : "border text-muted-foreground"
                }`}
              >
                {offlineEnabled ? "On" : "Off"}
              </button>
            </div>
          </aside>
        </>
      )}

      <Sheet open={explainOpen} onOpenChange={openExplain}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Explain differently</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              {EXPLAIN_PRESETS.map((preset) => (
                <Button key={preset} variant="outline" disabled={explainLoading} onClick={() => requestExplainDifferently(preset)}>
                  {preset}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground">Or ask for something specific</label>
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="e.g. explain this using a Kafka analogy instead"
                rows={3}
                className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <Button disabled={explainLoading || !customInstruction.trim()} onClick={() => requestExplainDifferently(customInstruction)}>
                Generate
              </Button>
            </div>
            {explainLoading && <p className="text-xs text-muted-foreground">Generating a new version — this calls Gemini and can take a moment…</p>}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={chatOpen} onOpenChange={openChat}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Ask about {conceptTitle}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {chatMessages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask anything about this concept — grounded in the book excerpt and what you&apos;ve been shown here.
              </p>
            )}
            {chatMessages.map((m) => (
              <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "self-end bg-primary text-primary-foreground" : "bg-muted"}`}>
                <Markdown className={m.role === "user" ? "prose-invert" : ""}>{m.content}</Markdown>
              </div>
            ))}
            {chatLoading && <p className="text-xs text-muted-foreground">Thinking…</p>}
          </div>
          <div className="flex gap-2 border-t p-3">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
              placeholder="Ask a question…"
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <Button size="sm" disabled={chatLoading || !chatInput.trim()} onClick={sendChatMessage}>
              Send
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
