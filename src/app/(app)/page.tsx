import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { experiences, concepts, topics, chapters, books, users, conceptMastery } from "@/lib/db/schema";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { BookGrid } from "@/components/home/book-grid";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [[user], mastery] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    // "Resume experience" must reflect THIS user's own progress, not just
    // any experience that happens to exist — derive it from their own
    // conceptMastery rows (same source the sidebar's Continue card uses).
    db.select().from(conceptMastery).where(eq(conceptMastery.userId, userId)),
  ]);

  // Only fetch the concepts this user actually has mastery rows for — not
  // all 460+ concepts in the book just to build a lookup map.
  const conceptRows = mastery.length
    ? await db.select().from(concepts).where(inArray(concepts.id, mastery.map((m) => m.conceptId)))
    : [];
  const conceptById = new Map(conceptRows.map((c) => [c.id, c]));

  const [mostRecentMastery] = [...mastery].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  let featured: {
    id: string;
    title: string;
    conceptTitle: string;
    topicTitle: string;
    chapterTitle: string;
    chapterNumber: number;
    bookTitle: string;
  } | null = null;
  if (mostRecentMastery) {
    const concept = conceptById.get(mostRecentMastery.conceptId);
    if (concept) {
      const [row] = await db
        .select({
          id: experiences.id,
          title: experiences.title,
          conceptTitle: concepts.title,
          topicTitle: topics.title,
          chapterTitle: chapters.title,
          chapterNumber: chapters.number,
          bookTitle: books.title,
        })
        .from(experiences)
        .innerJoin(concepts, eq(experiences.conceptId, concepts.id))
        .innerJoin(topics, eq(concepts.topicId, topics.id))
        .innerJoin(chapters, eq(topics.chapterId, chapters.id))
        .innerJoin(books, eq(chapters.bookId, books.id))
        .where(eq(experiences.conceptId, concept.id));
      featured = row ?? null;
    }
  }

  const toRevisit = mastery
    .map((m) => ({ ...m, concept: conceptById.get(m.conceptId) }))
    .filter((m) => m.concept && m.masteryPct < 70)
    .sort((a, b) => a.masteryPct - b.masteryPct)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[26px] font-semibold">Welcome back, {user?.name}</h1>
      </div>

      {featured && (
        <div className="flex items-stretch gap-5 rounded-2xl border bg-card px-7 py-6">
          <div className="flex flex-1 flex-col justify-center gap-1.5">
            <p className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">
              {featured.bookTitle.toUpperCase()} · CH.{featured.chapterNumber} {featured.chapterTitle.toUpperCase()} · {featured.topicTitle.toUpperCase()}
            </p>
            <p className="text-[19px] font-semibold leading-tight">{featured.title}</p>
            <p className="max-w-[520px] text-[13px] leading-relaxed text-muted-foreground">{featured.conceptTitle}</p>
          </div>
          <Link
            href={`/experience/${featured.id}`}
            className={buttonVariants({ className: "h-auto self-center whitespace-nowrap rounded-lg px-6 py-3 text-sm font-semibold" })}
          >
            Resume experience
          </Link>
        </div>
      )}

      {toRevisit.length > 0 && (
        <div className="flex flex-col gap-3.5">
          <p className="text-[15px] font-semibold">Concepts to revisit</p>
          {toRevisit.map((m) => (
            <div key={m.id} className="flex items-center gap-4 rounded-[10px] border bg-card px-[18px] py-3.5">
              <span className="flex-1 text-sm font-medium">{m.concept!.title}</span>
              <Progress value={m.masteryPct} className="h-1.5 w-[120px]" />
              <span className="w-[34px] font-mono text-xs font-semibold text-muted-foreground">{Math.round(m.masteryPct)}%</span>
              <Link href="/progress" className="text-xs font-semibold text-accent-foreground">
                Revisit
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        <p className="text-[15px] font-semibold">Your library</p>
        <BookGrid
          books={[
            { title: "Designing Data-Intensive Applications", short: "DDIA", href: "/library" },
            { title: "System Design Interview", short: "SDI", href: null },
            { title: "Clean Architecture", short: "CA", href: null },
          ]}
        />
      </div>
    </div>
  );
}
