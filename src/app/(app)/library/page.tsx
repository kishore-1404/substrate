import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { books, chapters, topics, concepts, experiences } from "@/lib/db/schema";
import { withDbRetry } from "@/lib/db/retry";
import { LibraryBrowser } from "@/components/library/library-browser";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [book] = await withDbRetry(() => db.select().from(books).where(eq(books.slug, "ddia")));
  if (!book) return <div className="p-8">No book seeded yet — run `npm run seed:book`.</div>;

  // Select only the columns the browser actually renders — the previous
  // version pulled every column, including each concept's full sourceChunk
  // (real book paragraphs, several KB each × 460+ rows) just to show a
  // title. That was the single biggest page-weight/latency cost in the app.
  // Each query gets one retry against a transient Neon fetch failure.
  const [chapterRows, topicRows, conceptRows, experienceRows] = await Promise.all([
    withDbRetry(() => db.select().from(chapters).where(eq(chapters.bookId, book.id))),
    withDbRetry(() => db.select({ id: topics.id, chapterId: topics.chapterId, title: topics.title }).from(topics)),
    withDbRetry(() => db.select({ id: concepts.id, slug: concepts.slug, title: concepts.title, topicId: concepts.topicId }).from(concepts)),
    withDbRetry(() =>
      db
        .select({ id: experiences.id, conceptId: experiences.conceptId, personalizationBucket: experiences.personalizationBucket })
        .from(experiences)
    ),
  ]);

  const data = {
    book: { title: book.title },
    chapters: chapterRows
      .sort((a, b) => a.number - b.number)
      .map((ch) => ({
        id: ch.id,
        number: ch.number,
        title: ch.title,
        topics: topicRows
          .filter((t) => t.chapterId === ch.id)
          .map((t) => ({
            id: t.id,
            title: t.title,
            concepts: conceptRows
              .filter((c) => c.topicId === t.id)
              .map((c) => ({
                id: c.id,
                slug: c.slug,
                title: c.title,
                // Canonical experience only — "explain differently" variants
                // carry a `:variant` suffix on the bucket and shouldn't be
                // what a fresh learner lands on from the Library.
                experienceId:
                  experienceRows.find((e) => e.conceptId === c.id && !e.personalizationBucket.includes(":"))?.id ?? null,
              })),
          })),
      })),
  };

  return <LibraryBrowser data={data} />;
}
