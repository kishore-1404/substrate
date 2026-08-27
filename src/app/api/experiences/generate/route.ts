import { NextRequest, NextResponse } from "next/server";
import { runExperienceGeneration } from "@/lib/ai/pipeline";
import { contractForConcept } from "@/lib/ai/schemas";

// Trigger #1/#2/#3 from spec §4: first-time generation for a
// (concept, bucket), or an explicit "explain differently" request.
//
// The retry-with-feedback loop (up to MAX_ATTEMPTS Gemini calls) can run
// well past Vercel's default serverless timeout (10s on Hobby) — without
// this the function gets killed mid-generation with no useful error.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, conceptSlug, userRequest } = body as {
    userId: string;
    conceptSlug: string;
    userRequest?: string;
  };

  if (!userId || !conceptSlug) {
    return NextResponse.json({ error: "userId and conceptSlug are required" }, { status: 400 });
  }

  const result = await runExperienceGeneration({
    userId,
    conceptSlug,
    contract: contractForConcept(conceptSlug),
    userRequest,
  });

  if (result.status === "failed") {
    return NextResponse.json({ error: "generation failed validation", errors: result.errors }, { status: 422 });
  }

  return NextResponse.json({ experienceId: result.experienceId, cached: false });
}
