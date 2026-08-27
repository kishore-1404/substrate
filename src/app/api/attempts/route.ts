import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { experiences, conceptMastery } from "@/lib/db/schema";
import { computeMasteryPct } from "@/lib/ai/mastery";

// Records an assessment/decision result and updates ConceptMastery. Pure
// computation (spec §7) — never an LLM call.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, experienceId, assessmentScore, decisionCorrect, simulationEngaged } = body as {
    userId: string;
    experienceId: string;
    assessmentScore: number;
    decisionCorrect: boolean | null;
    simulationEngaged: boolean;
  };

  const [experience] = await db.select().from(experiences).where(eq(experiences.id, experienceId));
  if (!experience) return NextResponse.json({ error: "experience not found" }, { status: 404 });

  const masteryPct = computeMasteryPct({ assessmentScore, decisionCorrect, simulationEngaged });

  const [existing] = await db
    .select()
    .from(conceptMastery)
    .where(and(eq(conceptMastery.userId, userId), eq(conceptMastery.conceptId, experience.conceptId)));

  const revisionEntry = { at: new Date().toISOString(), masteryPct, source: "assessment" };

  if (existing) {
    await db
      .update(conceptMastery)
      .set({
        masteryPct,
        attempts: existing.attempts + 1,
        mistakes: existing.mistakes + (assessmentScore < 1 ? 1 : 0),
        revisionHistory: [...(existing.revisionHistory ?? []), revisionEntry],
        updatedAt: new Date(),
      })
      .where(eq(conceptMastery.id, existing.id));
  } else {
    await db.insert(conceptMastery).values({
      userId,
      conceptId: experience.conceptId,
      masteryPct,
      attempts: 1,
      mistakes: assessmentScore < 1 ? 1 : 0,
      revisionHistory: [revisionEntry],
    });
  }

  return NextResponse.json({ masteryPct });
}
