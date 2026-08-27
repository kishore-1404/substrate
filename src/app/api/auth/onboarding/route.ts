import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { role, experienceLevel, goal, preferredExplanationStyle } = (await req.json()) as {
    role?: string;
    experienceLevel?: string;
    goal?: string;
    preferredExplanationStyle?: string;
  };

  await db.update(users).set({ role, experienceLevel, goal, preferredExplanationStyle }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
