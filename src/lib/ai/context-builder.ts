import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { concepts, topics, chapters, books, users, conceptMastery, learnerFacts } from "@/lib/db/schema";
import type { GenerationContract } from "./schemas";

// The seven context categories from the engineering handoff §8, assembled
// fresh per request. Gemini receives only this package — never raw DB access
// and never its own conversational memory (handoff §8 intro).
export interface ContextPackage {
  learner: {
    role: string | null;
    experienceLevel: string | null;
    goal: string | null;
    preferredExplanationStyle: string | null;
    knownConcepts: string[];
    weakConcepts: string[];
  };
  source: {
    book: string;
    chapter: string;
    topic: string;
    concept: string;
    sourceChunk: string | null;
  };
  learningState: {
    previousAttempts: number;
    commonMistakes: string[];
  };
  session: {
    userRequest: string | null;
  };
  generation: GenerationContract;
}

export async function buildContext(opts: {
  userId: string;
  conceptSlug: string;
  contract: GenerationContract;
  userRequest?: string;
}): Promise<ContextPackage> {
  const { userId, conceptSlug, contract, userRequest } = opts;

  const [concept] = await db
    .select({
      id: concepts.id,
      title: concepts.title,
      sourceChunk: concepts.sourceChunk,
      topicId: concepts.topicId,
    })
    .from(concepts)
    .where(eq(concepts.slug, conceptSlug));

  if (!concept) throw new Error(`Unknown concept slug: ${conceptSlug}`);

  const [topic] = await db.select().from(topics).where(eq(topics.id, concept.topicId));
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, topic.chapterId));
  const [book] = await db.select().from(books).where(eq(books.id, chapter.bookId));

  const [user] = await db.select().from(users).where(eq(users.id, userId));

  const masteryRows = await db.select().from(conceptMastery).where(eq(conceptMastery.userId, userId));
  const weakConcepts = masteryRows.filter((m) => m.masteryPct < 70).map((m) => m.conceptId);
  const knownConcepts = masteryRows.filter((m) => m.masteryPct >= 70).map((m) => m.conceptId);

  const thisMastery = masteryRows.find((m) => m.conceptId === concept.id);

  const facts = await db
    .select()
    .from(learnerFacts)
    .where(and(eq(learnerFacts.userId, userId), eq(learnerFacts.key, "common_mistake")));

  return {
    learner: {
      role: user?.role ?? null,
      experienceLevel: user?.experienceLevel ?? null,
      goal: user?.goal ?? null,
      preferredExplanationStyle: user?.preferredExplanationStyle ?? null,
      knownConcepts,
      weakConcepts,
    },
    source: {
      book: book.title,
      chapter: `${chapter.number}: ${chapter.title}`,
      topic: topic.title,
      concept: concept.title,
      // Minimum useful chunk, not the whole book (handoff §8.3) — the
      // concept row stores only its own excerpt, never the full PDF.
      sourceChunk: concept.sourceChunk,
    },
    learningState: {
      previousAttempts: thisMastery?.attempts ?? 0,
      commonMistakes: facts.map((f) => String((f.value as { text?: string })?.text ?? "")),
    },
    session: {
      userRequest: userRequest ?? null,
    },
    generation: contract,
  };
}
