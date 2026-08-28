import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { chatAboutConcept, getUserLlmConfig } from "@/lib/ai/llm";
import type { ChatMessage } from "@/lib/ai/prompts";

// AI-assisted reading over a locally opened PDF: the file itself never
// leaves the browser (see offline-library.ts), only the current page's
// extracted text is sent as context — same shape as the concept chat, just
// with a page instead of a concept as the "source chunk".
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { pageText, pageLabel, question, history } = (await req.json()) as {
    pageText?: string;
    pageLabel?: string;
    question?: string;
    history?: ChatMessage[];
  };
  if (!question?.trim()) return NextResponse.json({ error: "question is required" }, { status: 400 });

  const llm = await getUserLlmConfig(userId);
  const reply = await chatAboutConcept(
    {
      title: pageLabel || "PDF page",
      sourceChunk: pageText ?? "",
      mentalModel: "",
      explanation: "",
      example: "",
    },
    Array.isArray(history) ? history : [],
    question,
    llm
  );

  return NextResponse.json({ reply });
}
