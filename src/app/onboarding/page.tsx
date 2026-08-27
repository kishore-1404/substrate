"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const QUESTIONS = [
  { field: "role", q: "What's your role?", options: ["Backend engineer", "Frontend engineer", "Data / ML engineer", "Other"] },
  { field: "experienceLevel", q: "How experienced are you?", options: ["New grad", "1–3 years", "3–7 years", "7+ years"] },
  {
    field: "goal",
    q: "What are you hoping to get out of this?",
    options: ["Pass system design interviews", "Build better systems at work", "Understand a book I'm reading", "Just curious"],
  },
  {
    field: "preferredExplanationStyle",
    q: "How do you like explanations?",
    options: ["Short and direct", "Detailed, with examples", "Analogies and stories"],
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isConfirm = step === QUESTIONS.length;
  const current = QUESTIONS[step];

  async function finish() {
    setSaving(true);
    try {
      await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      router.push("/");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-5 sm:p-10">
      <div className="flex w-full max-w-[560px] flex-col gap-9">
        <div className="flex items-center justify-center gap-2.5">
          <div className="h-[9px] w-[9px] rounded-[2px] bg-primary" />
          <span className="font-mono text-sm font-semibold tracking-wide text-muted-foreground">SUBSTRATE</span>
        </div>

        <div className="flex justify-center gap-1.5">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-[5px] rounded-full transition-all ${i === step ? "w-[22px]" : "w-4"} ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
          <div className={`h-[5px] w-4 rounded-full ${isConfirm ? "bg-primary" : "bg-muted"}`} />
        </div>

        {!isConfirm ? (
          <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-10">
            <p className="text-xl font-semibold leading-snug">{current.q}</p>
            <div className="flex flex-col gap-2.5">
              {current.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAnswers((a) => ({ ...a, [current.field]: opt }))}
                  className={`rounded-[10px] border px-[18px] py-3.5 text-left text-[15px] font-medium transition-colors ${
                    answers[current.field] === opt ? "border-primary bg-accent" : "hover:border-primary/60"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className={`text-[13px] font-medium text-muted-foreground ${step === 0 ? "invisible" : ""}`}
              >
                Back
              </button>
              <Button
                className="h-auto rounded-lg px-[22px] py-2.5 text-sm font-semibold"
                disabled={!answers[current.field]}
                onClick={() => setStep((s) => s + 1)}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6 text-center sm:p-11">
            <p className="text-xl font-semibold">You&apos;re set</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We&apos;ll pace explanations and challenges to what you told us. You can always ask for something simpler,
              deeper, or different mid-lesson.
            </p>
            <Button className="mt-2 h-auto self-center rounded-lg px-7 py-3 text-sm font-semibold" onClick={finish} disabled={saving}>
              {saving ? "…" : "Enter the library"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
