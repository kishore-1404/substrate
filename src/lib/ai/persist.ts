import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { concepts, experiences, experienceStages } from "@/lib/db/schema";
import type { ExperienceGeneration, GenerationContract } from "./schemas";

function bucketFor(contract: GenerationContract, userRequest?: string): string {
  // Coarse cache key — NOT per-user (spec §4). Many learners on the same
  // (concept, depth, difficulty) share this row for the canonical case.
  const depth = contract.difficulty <= 1 ? "concise" : contract.difficulty === 2 ? "detailed" : "deep";
  const base = `${depth}/${contract.difficulty}`;
  // An explicit "explain differently" request must persist as its own
  // variant, never collide with (or overwrite) the canonical experience —
  // spec §4 trigger #2. Without this, every adaptive request hit the same
  // unique (conceptId, contractVersion, personalizationBucket) row.
  if (!userRequest) return base;
  const variant = userRequest.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base}:${variant}`;
}

export async function persistExperience(opts: {
  conceptSlug: string;
  contract: GenerationContract;
  generation: ExperienceGeneration;
  userRequest?: string;
}): Promise<string> {
  const { conceptSlug, contract, generation, userRequest } = opts;

  const [concept] = await db.select().from(concepts).where(eq(concepts.slug, conceptSlug));
  if (!concept) throw new Error(`Unknown concept slug: ${conceptSlug}`);

  const [experience] = await db
    .insert(experiences)
    .values({
      conceptId: concept.id,
      contractVersion: contract.markdyVersion,
      personalizationBucket: bucketFor(contract, userRequest),
      title: generation.title,
      generationRequest: userRequest ?? null,
      status: "validated",
    })
    .returning();

  let order = 0;
  for (const stage of generation.stages) {
    await db.insert(experienceStages).values({
      experienceId: experience.id,
      order: order++,
      type: stage.type,
      generatedBy: stage.type === "simulation" ? "gemini" : "gemini",
      payload: stage.payload as object,
    });
  }

  // `mastery_update` is never requested from Gemini (spec §2) — it's a
  // bookkeeping placeholder; the actual number is computed at play-time by
  // mastery.ts. `consequence` is no longer a separate stage at all — each
  // decision choice now carries its own `consequence` text (see
  // schemas.ts's decisionChoice), read directly off the decision stage
  // instead of a second stage row.
  await db.insert(experienceStages).values({
    experienceId: experience.id,
    order: order++,
    type: "mastery_update",
    generatedBy: "computed",
    payload: { computedAtPlaytimeFrom: "assessment + decision correctness" },
  });

  await db.update(experiences).set({ status: "published" }).where(eq(experiences.id, experience.id));

  return experience.id;
}
