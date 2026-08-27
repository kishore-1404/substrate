import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { experiences, experienceStages, concepts, experienceChatMessages } from "@/lib/db/schema";
import { chatAboutConcept, getUserLlmConfig } from "@/lib/ai/llm";

// This also calls Gemini (chatAboutConcept) — same Vercel timeout headroom
// as the generate route, though a single chat turn is normally much faster
// than the retry loop that route runs.
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const messages = await db
    .select()
    .from(experienceChatMessages)
    .where(and(eq(experienceChatMessages.experienceId, id), eq(experienceChatMessages.userId, userId)))
    .orderBy(asc(experienceChatMessages.createdAt));

  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, message } = (await req.json()) as { userId?: string; message?: string };
  if (!userId || !message?.trim()) {
    return NextResponse.json({ error: "userId and message are required" }, { status: 400 });
  }

  const [experience] = await db.select().from(experiences).where(eq(experiences.id, id));
  if (!experience) return NextResponse.json({ error: "experience not found" }, { status: 404 });

  const [concept] = await db.select().from(concepts).where(eq(concepts.id, experience.conceptId));
  const stages = await db.select().from(experienceStages).where(eq(experienceStages.experienceId, id));
  const findText = (type: string, field: string) =>
    ((stages.find((s) => s.type === type)?.payload as Record<string, string>) ?? {})[field] ?? "";

  const history = await db
    .select()
    .from(experienceChatMessages)
    .where(and(eq(experienceChatMessages.experienceId, id), eq(experienceChatMessages.userId, userId)))
    .orderBy(asc(experienceChatMessages.createdAt));

  const llm = await getUserLlmConfig(userId);
  const reply = await chatAboutConcept(
    {
      title: concept?.title ?? experience.title,
      sourceChunk: concept?.sourceChunk ?? "",
      mentalModel: findText("mental_model", "text"),
      explanation: findText("explanation", "text"),
      example: findText("example", "scenario"),
    },
    history.map((m) => ({ role: m.role, content: m.content })),
    message,
    llm
  );

  const [userMsg, assistantMsg] = await db
    .insert(experienceChatMessages)
    .values([
      { experienceId: id, userId, role: "user", content: message },
      { experienceId: id, userId, role: "assistant", content: reply },
    ])
    .returning();

  return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg });
}
