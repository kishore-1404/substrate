// Concept-extraction step from book_ingestion_spec.md §6 — the one the
// Python parser explicitly does NOT do (it's mechanical-only). This script
// is also not an LLM step: it's a human-curated map of (concept -> where in
// the parsed structure it lives), applied mechanically. A person decided
// which sections/anchors matter; the script just does the lookup and text
// slicing so the real book text — not a hand-written stand-in — ends up in
// `concepts.sourceChunk`. Swap this for an LLM-assisted curator later if the
// manual map becomes a bottleneck; the DB write shape stays the same.
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { books, chapters, topics, concepts } from "./schema";

interface RawBlock {
  type: "paragraph" | "figure" | "table" | "subsection";
  page?: number;
  text?: string;
  numbering?: string;
  title?: string;
  blocks?: RawBlock[];
}
interface RawSection {
  numbering: string;
  title: string;
  startPage: number;
  blocks: RawBlock[];
}
interface RawChapter {
  book: { slug: string; title: string; author: string };
  chapter: { number: number; title: string; startPage: number; endPage: number };
  sections: RawSection[];
}

function findNode(sections: RawSection[], numbering: string): RawSection | RawBlock | undefined {
  for (const sec of sections) {
    if (sec.numbering === numbering) return sec;
    const found = findInBlocks(sec.blocks, numbering);
    if (found) return found;
  }
  return undefined;
}

function findInBlocks(blocks: RawBlock[], numbering: string): RawBlock | undefined {
  for (const b of blocks) {
    if (b.type === "subsection" && b.numbering === numbering) return b;
    if (b.type === "subsection" && b.blocks) {
      const found = findInBlocks(b.blocks, numbering);
      if (found) return found;
    }
  }
  return undefined;
}

const MAX_CHARS = 1500;

function extractChunk(node: RawSection | RawBlock, anchor: string, paragraphCount: number): string {
  const directParagraphs = (node.blocks ?? []).filter((b): b is RawBlock & { text: string } => b.type === "paragraph" && !!b.text);
  const startIdx = directParagraphs.findIndex((p) => p.text.includes(anchor));
  if (startIdx === -1) {
    throw new Error(`Anchor not found: "${anchor}" under ${"numbering" in node ? node.numbering : "?"}`);
  }
  const slice = directParagraphs.slice(startIdx, startIdx + paragraphCount).map((p) => p.text);
  let chunk = slice.join(" ");
  if (chunk.length > MAX_CHARS) {
    const cut = chunk.lastIndexOf(". ", MAX_CHARS);
    chunk = chunk.slice(0, cut > 0 ? cut + 1 : MAX_CHARS);
  }
  return chunk;
}

interface ConceptSpec {
  slug: string;
  title: string;
  topicTitle: string;
  sectionNumbering: string;
  anchor: string;
  paragraphCount: number;
  prerequisites: string[];
}

// The human-curated map. Each entry names exactly where in the parsed
// structure the concept's explanation lives.
const CONCEPT_SPECS: ConceptSpec[] = [
  {
    slug: "single_leader_replication",
    title: "Single-Leader Replication",
    topicTitle: "Leaders and Followers",
    sectionNumbering: "5.1",
    anchor: "Each node that stores a copy of the database is called a replica.",
    paragraphCount: 2,
    prerequisites: [],
  },
  {
    slug: "replication_lag",
    title: "Replication Lag",
    topicTitle: "Leaders and Followers",
    sectionNumbering: "5.2",
    anchor: "Unfortunately, if an application reads from an asynchronous follower",
    paragraphCount: 2,
    prerequisites: ["single_leader_replication"],
  },
  {
    slug: "read_your_writes",
    title: "Reading Your Own Writes",
    topicTitle: "Problems with Replication Lag",
    sectionNumbering: "5.2.1",
    anchor: "Many applications let the user submit some data and then view what they have submitted.",
    paragraphCount: 2,
    prerequisites: ["replication_lag"],
  },
  {
    slug: "monotonic_reads",
    title: "Monotonic Reads",
    topicTitle: "Problems with Replication Lag",
    sectionNumbering: "5.2.2",
    anchor: "Our second example of an anomaly that can occur when reading from asynchronous followers",
    paragraphCount: 2,
    prerequisites: ["replication_lag"],
  },
  {
    slug: "consistent_prefix_reads",
    title: "Consistent Prefix Reads",
    topicTitle: "Problems with Replication Lag",
    sectionNumbering: "5.2.3",
    anchor: "Our third example of replication lag anomalies concerns violation of causality.",
    paragraphCount: 1,
    prerequisites: ["replication_lag"],
  },
];

async function main() {
  const raw: RawChapter = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../../ingestion/ddia/_raw/chapter-05.json"), "utf-8")
  );

  const [book] = await db.select().from(books).where(eq(books.slug, raw.book.slug));
  if (!book) throw new Error(`Run npm run seed first — book "${raw.book.slug}" not found.`);

  const [chapter] = await db.select().from(chapters).where(eq(chapters.bookId, book.id));
  if (!chapter) throw new Error("Run npm run seed first — chapter not found.");

  const topicCache = new Map<string, string>();

  for (const spec of CONCEPT_SPECS) {
    let topicId = topicCache.get(spec.topicTitle);
    if (!topicId) {
      const [existing] = await db.select().from(topics).where(eq(topics.title, spec.topicTitle));
      if (existing) {
        topicId = existing.id;
      } else {
        const [inserted] = await db.insert(topics).values({ chapterId: chapter.id, title: spec.topicTitle }).returning();
        topicId = inserted.id;
      }
      topicCache.set(spec.topicTitle, topicId);
    }

    const node = findNode(raw.sections, spec.sectionNumbering);
    if (!node) throw new Error(`Section ${spec.sectionNumbering} not found in parsed chapter.`);
    const sourceChunk = extractChunk(node, spec.anchor, spec.paragraphCount);

    await db
      .insert(concepts)
      .values({
        topicId,
        slug: spec.slug,
        title: spec.title,
        sourceChunk,
        prerequisites: spec.prerequisites,
      })
      .onConflictDoUpdate({
        target: concepts.slug,
        set: { title: spec.title, sourceChunk, prerequisites: spec.prerequisites, topicId },
      });

    console.log(`✓ ${spec.slug} — ${sourceChunk.length} chars from ${spec.sectionNumbering}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
