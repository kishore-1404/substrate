import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { provider, model } = (await req.json()) as { provider?: string; model?: string };
  if (provider !== "gemini" && provider !== "openrouter") {
    return NextResponse.json({ error: "provider must be 'gemini' or 'openrouter'" }, { status: 400 });
  }
  if (!model) return NextResponse.json({ error: "model is required" }, { status: 400 });

  await db.update(users).set({ llmProvider: provider, llmModel: model }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
