// NOTE: env is loaded via `--env-file=.env.local` in the `seed` npm script,
// not via a top-level dotenv import here — ESM import hoisting would run
// `./client`'s top-level DATABASE_URL check before any dotenv call in this
// file executed.
import { eq, and } from "drizzle-orm";
import { db } from "./client";
import { books, chapters, topics, concepts, experiences, experienceStages, experienceChatMessages, users } from "./schema";

const REPLICATION_MARKDY = `scene "Replication Lag" theme=blueprint
layout LR

client Client "Client"
leader Leader "Leader DB"
follower Follower "Follower DB"

beat write "Client writes":
  Client -> Leader "INSERT profile.bio"
  Client <- Leader "200 OK"
  glow Leader color=#22c55e

beat replicate "Async replication":
  Leader ~> Follower "replicate WAL"
  frame Follower zoom=1.15

beat stale_read "Client reads from follower too soon":
  Client -> Follower "GET profile"
  Client <- Follower "old bio"
  glow Follower color=#ef4444 & focus Client`;

async function main() {
  console.log("Seeding...");

  const [existingBook] = await db.select().from(books).where(eq(books.slug, "ddia"));
  const bookRow =
    existingBook ??
    (
      await db
        .insert(books)
        .values({ slug: "ddia", title: "Designing Data-Intensive Applications", author: "Martin Kleppmann" })
        .returning()
    )[0];

  const [existingChapter] = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.bookId, bookRow.id), eq(chapters.number, 5)));
  const chapter =
    existingChapter ?? (await db.insert(chapters).values({ bookId: bookRow.id, number: 5, title: "Replication" }).returning())[0];

  const [existingTopic] = await db.select().from(topics).where(eq(topics.chapterId, chapter.id));
  const topic = existingTopic ?? (await db.insert(topics).values({ chapterId: chapter.id, title: "Leaders and Followers" }).returning())[0];

  // Placeholder sourceChunk — onConflictDoNothing so this never clobbers real
  // book text already loaded by `npm run ingest:concepts`. Run seed first
  // (bootstraps the concept row), then ingest:concepts (overwrites with the
  // real parsed excerpt).
  const [insertedConcept] = await db
    .insert(concepts)
    .values({
      topicId: topic.id,
      slug: "replication_lag",
      title: "Replication Lag",
      sourceChunk:
        "With single-leader replication, all writes go through the leader, but any node can serve reads. For read-scaling architectures with many followers, replication is often asynchronous: the leader doesn't wait for followers to confirm before reporting success. This edge is called replication lag, and if a client reads from a follower that hasn't caught up, it observes stale data.",
      prerequisites: [],
    })
    .onConflictDoNothing()
    .returning();
  const concept = insertedConcept ?? (await db.select().from(concepts).where(eq(concepts.slug, "replication_lag")))[0];

  const [insertedUser] = await db
    .insert(users)
    .values({
      name: "Demo User",
      email: "demo@example.com",
      passwordHash: "not-a-real-hash",
      role: "backend_engineer",
      experienceLevel: "intermediate",
      goal: "pass system design interviews",
      preferredExplanationStyle: "detailed",
    })
    .onConflictDoNothing()
    .returning();
  const demoUser = insertedUser ?? (await db.select().from(users).where(eq(users.email, "demo@example.com")))[0];

  // Idempotent: clear out any previous seed run for this (concept, contract,
  // bucket) before re-inserting, so `npm run seed` is safe to re-run after
  // editing the seed content.
  const [existingExperience] = await db
    .select()
    .from(experiences)
    .where(and(eq(experiences.conceptId, concept.id), eq(experiences.personalizationBucket, "detailed/2")));
  if (existingExperience) {
    await db.delete(experienceChatMessages).where(eq(experienceChatMessages.experienceId, existingExperience.id));
    await db.delete(experienceStages).where(eq(experienceStages.experienceId, existingExperience.id));
    await db.delete(experiences).where(eq(experiences.id, existingExperience.id));
  }

  const [experience] = await db
    .insert(experiences)
    .values({
      conceptId: concept.id,
      contractVersion: "1.0.30",
      personalizationBucket: "detailed/2",
      title: "Where should this read go?",
      status: "published",
    })
    .returning();

  const stages: Array<{
    type: "mental_model" | "visualization" | "explanation" | "example" | "simulation" | "decision" | "consequence" | "assessment" | "mastery_update";
    generatedBy: "gemini" | "engine" | "computed";
    payload: object;
  }> = [
    {
      type: "mental_model",
      generatedBy: "gemini",
      payload: {
        text: "Writes always go to the leader. Reads can go to the leader or to a follower. Followers replicate asynchronously, so a follower can briefly lag behind the leader's latest state.",
      },
    },
    { type: "visualization", generatedBy: "gemini", payload: { markdy: REPLICATION_MARKDY } },
    {
      type: "explanation",
      generatedBy: "gemini",
      payload: {
        text: "Replication lag happens because the leader doesn't wait for followers before acknowledging a write. The delay comes from network transit time, follower apply time, and follower load. It's normal, not a failure — but it means a read immediately after a write can return stale data if it's routed to a lagging follower.",
      },
    },
    {
      type: "example",
      generatedBy: "gemini",
      payload: { scenario: "You update your profile bio, then immediately reload the page. The reload hits a follower that hasn't applied your write yet — your old bio is still showing." },
    },
    {
      type: "simulation",
      generatedBy: "gemini",
      payload: { initialReplicaCount: 2, trafficPattern: "steady", injectedFault: "none", minLagSeconds: 0.1, maxLagSeconds: 4.2 },
    },
    {
      type: "decision",
      generatedBy: "gemini",
      payload: {
        prompt: "You just wrote your profile bio. Where should the confirmation page read it back from?",
        choices: [
          {
            id: "leader",
            label: "Read from Leader",
            consequence:
              "Reading from the leader always sees the latest write — no staleness. The tradeoff: every read now adds load to the single leader, which doesn't scale the way follower reads do.",
          },
          {
            id: "follower",
            label: "Read from Follower",
            consequence:
              "The confirmation page hits a follower that hasn't applied the write yet — the user sees their old bio. This is a stale read, not a bug: it's the direct cost of reading from an asynchronous replica.",
          },
        ],
      },
    },
    {
      type: "assessment",
      generatedBy: "gemini",
      payload: {
        questions: [
          {
            id: "q1",
            prompt: "A user reloads immediately after writing and sees stale data. What is this an example of?",
            options: [
              { id: "a", label: "A failed write" },
              { id: "b", label: "A stale read due to replication lag" },
              { id: "c", label: "A network outage" },
            ],
            correctOptionId: "b",
          },
          {
            id: "q2",
            prompt: "Which read strategy guarantees read-your-own-writes right after a write?",
            options: [
              { id: "a", label: "Read from any follower" },
              { id: "b", label: "Read from the leader" },
              { id: "c", label: "Read from the oldest follower" },
            ],
            correctOptionId: "b",
          },
          {
            id: "q3",
            prompt: "What primarily causes replication lag?",
            options: [
              { id: "a", label: "The leader intentionally delaying writes" },
              { id: "b", label: "Followers being asynchronous and having to apply changes after the leader" },
              { id: "c", label: "Client-side caching" },
            ],
            correctOptionId: "b",
          },
        ],
      },
    },
    {
      type: "mastery_update",
      generatedBy: "computed",
      payload: { computedAtPlaytimeFrom: "assessment + decision correctness" },
    },
  ];

  let order = 0;
  for (const stage of stages) {
    await db.insert(experienceStages).values({ experienceId: experience.id, order: order++, ...stage });
  }

  console.log("Seeded experience:", experience.id, "for user:", demoUser?.id);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
