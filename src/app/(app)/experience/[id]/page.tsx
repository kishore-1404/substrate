import { eq, asc } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { experiences, experienceStages, concepts, topics, chapters, books } from "@/lib/db/schema";
import { ExperiencePlayer } from "@/components/experience/experience-player";

export const dynamic = "force-dynamic";

export default async function ExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Nothing here actually depends on anything else at this point — the
  // experience row, its stages, and the session lookup all run concurrently
  // instead of one round trip at a time.
  const [[experience], stages, userId] = await Promise.all([
    db.select().from(experiences).where(eq(experiences.id, id)),
    db.select().from(experienceStages).where(eq(experienceStages.experienceId, id)).orderBy(asc(experienceStages.order)),
    getSessionUserId(),
  ]);
  if (!experience) return <div className="p-8">Experience not found.</div>;

  // Breadcrumb chain genuinely depends on experience.conceptId, so this is
  // one necessary second round trip — but one joined query, not four.
  const [breadcrumbRow] = await db
    .select({
      conceptSlug: concepts.slug,
      conceptTitle: concepts.title,
      sourceChunk: concepts.sourceChunk,
      topicTitle: topics.title,
      chapterNumber: chapters.number,
      chapterTitle: chapters.title,
      bookTitle: books.title,
    })
    .from(concepts)
    .innerJoin(topics, eq(concepts.topicId, topics.id))
    .innerJoin(chapters, eq(topics.chapterId, chapters.id))
    .innerJoin(books, eq(chapters.bookId, books.id))
    .where(eq(concepts.id, experience.conceptId));

  const breadcrumb = breadcrumbRow
    ? `${breadcrumbRow.bookTitle} / Ch.${breadcrumbRow.chapterNumber} ${breadcrumbRow.chapterTitle} / ${breadcrumbRow.topicTitle}`
    : "";

  return (
    <ExperiencePlayer
      userId={userId ?? ""}
      conceptSlug={breadcrumbRow?.conceptSlug ?? ""}
      conceptTitle={breadcrumbRow?.conceptTitle ?? ""}
      sourceChunk={breadcrumbRow?.sourceChunk ?? ""}
      breadcrumb={breadcrumb}
      initialData={{ experience, stages, cached: true }}
    />
  );
}
