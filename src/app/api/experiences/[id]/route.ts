import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { experiences, experienceStages } from "@/lib/db/schema";

// Reading a persisted, published Experience is a DB read + deterministic
// render — no Gemini call (handoff §7 / spec §4).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [experience] = await db.select().from(experiences).where(eq(experiences.id, id));
  if (!experience) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stages = await db
    .select()
    .from(experienceStages)
    .where(eq(experienceStages.experienceId, id))
    .orderBy(asc(experienceStages.order));

  return NextResponse.json({ experience, stages, cached: true });
}
