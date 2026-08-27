"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Catches errors thrown while rendering any page under this layout (Home,
// Library, Progress, Experience, Concept) — a transient Neon fetch failure
// on any of their queries previously meant an uncaught crash with no way
// back except a hard reload. Sidebar navigation stays intact since it lives
// in the layout, outside this boundary, so the learner can still get
// somewhere else even if this one page's data failed to load.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page-level error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <p className="font-medium text-destructive">Something didn&apos;t load.</p>
      <p className="text-sm text-muted-foreground">
        This is usually a transient database connection issue. Try again — if it keeps happening, the underlying
        Neon connection may be down.
      </p>
      <Button size="sm" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
