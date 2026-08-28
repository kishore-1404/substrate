"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/ui/markdown";
import { Button } from "@/components/ui/button";
import { saveConceptChunk } from "@/lib/offline-library";

// Trigger #1 from experience_spec_replication_lag.md §4: first-time
// generation for a (concept, bucket). There is no bulk pre-seeding — this
// component IS the moment a concept turns into an Experience, on-demand,
// the first time a learner opens it. Generation can take a while (the
// pipeline retries with feedback until Gemini gets it right or explicitly
// skips an optional stage — see pipeline.ts), so instead of a blank spinner
// we hand the learner the real book text for this concept to read in the
// meantime.
export function GenerateAndRedirect({
  userId,
  conceptSlug,
  conceptTitle,
  breadcrumb,
  sourceChunk,
}: {
  userId: string;
  conceptSlug: string;
  conceptTitle: string;
  breadcrumb: string;
  sourceChunk: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"generating" | "error">("generating");
  const [errorDetail, setErrorDetail] = useState<string[]>([]);
  const started = useRef(false);

  async function generate() {
    setStatus("generating");
    try {
      const res = await fetch("/api/experiences/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, conceptSlug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorDetail(json.errors ?? [json.error ?? `HTTP ${res.status}`]);
        setStatus("error");
        return;
      }
      const { experienceId } = await res.json();
      router.push(`/experience/${experienceId}`);
    } catch {
      setErrorDetail(["Network error reaching the generation service."]);
      setStatus("error");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void saveConceptChunk({ slug: conceptSlug, title: conceptTitle, sourceChunk });
  }, [conceptSlug, conceptTitle, sourceChunk]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{breadcrumb}</p>
        <h1 className="text-2xl font-semibold">{conceptTitle}</h1>
      </div>

      {status === "generating" && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Building your interactive experience for this concept for the first time — this can take a little while.
          Read ahead from the book below in the meantime.
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Generation didn&apos;t complete.</p>
          <ul className="list-inside list-disc text-muted-foreground">
            {errorDetail.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <Button size="sm" onClick={generate}>Try again</Button>
        </div>
      )}

      <div className="rounded-lg border p-6">
        <p className="mb-3 font-mono text-xs text-muted-foreground">FROM THE BOOK</p>
        <Markdown>{sourceChunk || "_No source excerpt available for this concept yet._"}</Markdown>
      </div>
    </div>
  );
}
