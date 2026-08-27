import { eq, and, not, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, conceptMastery, concepts, topics, chapters, books, experiences } from "@/lib/db/schema";
import { withDbRetry } from "@/lib/db/retry";
import { SidebarUserPanel } from "./sidebar-user-panel";
import { SidebarUserPanelDegraded } from "./sidebar-user-panel-degraded";

interface ContinueCard {
  breadcrumb: string;
  title: string;
  href: string;
}
interface PanelData {
  currentUserName: string;
  daysActive: number;
  continueCard: ContinueCard | null;
  otherUsers: { id: string; name: string }[];
}

async function loadPanelData(userId: string): Promise<PanelData | null> {
  const [[user], masteryRows, otherUsers] = await Promise.all([
    withDbRetry(() => db.select().from(users).where(eq(users.id, userId))),
    withDbRetry(() => db.select().from(conceptMastery).where(eq(conceptMastery.userId, userId))),
    withDbRetry(() => db.select({ id: users.id, name: users.name }).from(users)),
  ]);
  if (!user) return null;

  const activeDays = new Set<string>();
  for (const row of masteryRows) {
    for (const entry of row.revisionHistory ?? []) activeDays.add(entry.at.slice(0, 10));
  }

  let continueCard: ContinueCard | null = null;
  const [mostRecent] = [...masteryRows].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  if (mostRecent) {
    const [row] = await withDbRetry(() =>
      db
        .select({
          conceptTitle: concepts.title,
          conceptSlug: concepts.slug,
          topicTitle: topics.title,
          chapterNumber: chapters.number,
          chapterTitle: chapters.title,
          bookTitle: books.title,
          experienceId: experiences.id,
        })
        .from(concepts)
        .innerJoin(topics, eq(concepts.topicId, topics.id))
        .innerJoin(chapters, eq(topics.chapterId, chapters.id))
        .innerJoin(books, eq(chapters.bookId, books.id))
        .leftJoin(experiences, and(eq(experiences.conceptId, concepts.id), not(like(experiences.personalizationBucket, "%:%"))))
        .where(eq(concepts.id, mostRecent.conceptId))
    );

    if (row) {
      continueCard = {
        breadcrumb: `${row.bookTitle} / Ch.${row.chapterNumber} ${row.chapterTitle} / ${row.topicTitle}`,
        title: row.conceptTitle,
        href: row.experienceId ? `/experience/${row.experienceId}` : `/concept/${row.conceptSlug}`,
      };
    }
  }

  return { currentUserName: user.name, daysActive: activeDays.size, continueCard, otherUsers };
}

// Isolated on purpose — every DB query the sidebar needs lives here, inside
// the Suspense boundary layout.tsx wraps this in, so it streams in after
// the nav shell (SidebarShell) and the page's own content, both of which
// render immediately without waiting on this.
//
// This runs on every navigation, so it's the most-exposed query path in the
// app to a transient Neon hiccup (e.g. a cold-start fetch failure after the
// compute auto-suspends from idle) — and it must never crash the whole page
// over it. Each query gets one retry, and if it still fails, the panel
// degrades to a minimal safe state (logout still works) instead of throwing
// an uncaught error into the render tree. Data-fetching and JSX
// construction are kept in separate steps — a try/catch around JSX itself
// doesn't actually catch anything, since React defers rendering.
export async function SidebarUserPanelServer({ userId }: { userId: string }) {
  let data: PanelData | null;
  try {
    data = await loadPanelData(userId);
  } catch (err) {
    console.error("SidebarUserPanelServer: DB unavailable after retry, degrading gracefully", err);
    return <SidebarUserPanelDegraded />;
  }

  if (!data) return null;
  return (
    <SidebarUserPanel
      currentUserId={userId}
      currentUserName={data.currentUserName}
      daysActive={data.daysActive}
      continueCard={data.continueCard}
      otherUsers={data.otherUsers}
    />
  );
}
