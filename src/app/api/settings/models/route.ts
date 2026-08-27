import { NextRequest, NextResponse } from "next/server";
import { listAvailableModels } from "@/lib/ai/models";
import type { LlmProviderName } from "@/lib/ai/llm";

// Live probe against the real provider — can take a few seconds (each
// candidate model gets a real trivial request in parallel), so this is
// meant for a settings screen, not a hot path.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") as LlmProviderName | null;
  if (provider !== "gemini" && provider !== "openrouter") {
    return NextResponse.json({ error: "provider must be 'gemini' or 'openrouter'" }, { status: 400 });
  }
  const models = await listAvailableModels(provider);
  return NextResponse.json({ models });
}
