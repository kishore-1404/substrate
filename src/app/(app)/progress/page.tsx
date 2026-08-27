import { eq, inArray } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { conceptMastery, concepts } from "@/lib/db/schema";
import { withDbRetry } from "@/lib/db/retry";
import { Progress as ProgressBar } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const masteryRows = await withDbRetry(() => db.select().from(conceptMastery).where(eq(conceptMastery.userId, userId)));
  const conceptRows = masteryRows.length
    ? await withDbRetry(() => db.select().from(concepts).where(inArray(concepts.id, masteryRows.map((m) => m.conceptId))))
    : [];
  const conceptById = new Map(conceptRows.map((c) => [c.id, c]));

  const activeDays = new Set<string>();
  let totalAttempts = 0;
  let totalMistakes = 0;
  for (const row of masteryRows) {
    totalAttempts += row.attempts;
    totalMistakes += row.mistakes;
    for (const entry of row.revisionHistory ?? []) activeDays.add(entry.at.slice(0, 10));
  }

  const rows = masteryRows
    .map((m) => ({ ...m, concept: conceptById.get(m.conceptId) }))
    .filter((m) => m.concept)
    .sort((a, b) => b.masteryPct - a.masteryPct);

  return (
    <div className="flex max-w-[760px] flex-col gap-7">
      <h1 className="text-[26px] font-semibold">Progress</h1>

      <div className="flex gap-4">
        <StatCard label="DAYS ACTIVE" value={String(activeDays.size)} />
        <StatCard label="ATTEMPTS" value={String(totalAttempts)} />
        <StatCard label="MISTAKES" value={String(totalMistakes)} />
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-col gap-3.5">
          <p className="font-mono text-[11px] text-muted-foreground">CONCEPT MASTERY</p>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-4">
              <span className="w-[190px] truncate text-sm font-medium">{r.concept!.title}</span>
              <ProgressBar value={r.masteryPct} className="h-2 flex-1" />
              <span className="w-9 text-right font-mono text-xs text-muted-foreground">{Math.round(r.masteryPct)}%</span>
              <span className="w-[90px] font-mono text-[11px] font-semibold text-destructive">
                {r.masteryPct < 70 ? "NEEDS REVIEW" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Complete an experience to start tracking mastery here.</p>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl border bg-card p-5">
      <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
