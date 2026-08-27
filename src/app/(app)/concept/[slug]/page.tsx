import { eq, and, not, like } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { concepts, experiences, topics, chapters, books } from "@/lib/db/schema";
import { GenerateAndRedirect } from "@/components/experience/generate-and-redirect";

export const dynamic = "force-dynamic";

export default async function ConceptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [concept] = await db.select().from(concepts).where(eq(concepts.slug, slug));
  if (!concept) return <div className="p-8">Unknown concept.</div>;

  // Everything below depends only on `concept`, not on each other — run
  // concurrently instead of four sequential round trips.
  const [[existing], [breadcrumbRow], userId] = await Promise.all([
    db
      .select()
      .from(experiences)
      .where(and(eq(experiences.conceptId, concept.id), not(like(experiences.personalizationBucket, "%:%")))),
    db
      .select({ topicTitle: topics.title, chapterNumber: chapters.number, chapterTitle: chapters.title, bookTitle: books.title })
      .from(topics)
      .innerJoin(chapters, eq(topics.chapterId, chapters.id))
      .innerJoin(books, eq(chapters.bookId, books.id))
      .where(eq(topics.id, concept.topicId)),
    getSessionUserId(),
  ]);

  // Revisiting a concept that already has a canonical (non-variant)
  // Experience is a DB read + render — never a new Gemini call.
  if (existing) redirect(`/experience/${existing.id}`);

  return (
    <GenerateAndRedirect
      userId={userId ?? ""}
      conceptSlug={concept.slug}
      conceptTitle={concept.title}
      breadcrumb={`${breadcrumbRow.bookTitle} / Ch.${breadcrumbRow.chapterNumber} ${breadcrumbRow.chapterTitle} / ${breadcrumbRow.topicTitle}`}
      sourceChunk={concept.sourceChunk ?? ""}
    />
  );
}
