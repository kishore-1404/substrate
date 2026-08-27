// Populates a Concept for every section AND subsection across all 12
// parsed chapters, with the FULL paragraph text of that node (not a
// trimmed excerpt) — per explicit request to fully populate the library,
// not just the minimum-useful-context excerpts used at generation time.
//
// This is still mechanical, not semantic curation: one concept per
// section/subsection node, containing everything directly under it. It
// does NOT identify "concepts" the way book_ingestion_spec.md §6 describes
// (that's real curation, done by hand for the 5 legacy slugs below) — it's
// a bulk digitization pass so the rest of the book has real content instead
// of nothing. Prerequisites are left empty; a curation pass can fill those
// in later the way ingest-concepts.ts already did for chapter 5.
import fs from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { db } from "./client";
import { books, chapters, topics, concepts } from "./schema";

const RAW_DIR = path.resolve(__dirname, "../../../../ingestion/ddia/_raw");

interface RawBlock {
  type: "paragraph" | "figure" | "table" | "subsection";
  text?: string;
  numbering?: string;
  title?: string;
  blocks?: RawBlock[];
}
interface RawChapterFile {
  book: { slug: string };
  chapter: { number: number; title: string };
  sections: { numbering: string; title: string; blocks: RawBlock[] }[];
}

// Already hand-curated with tight excerpts + real prerequisite chains (see
// ingest-concepts.ts) — never overwrite these with a generic full-text dump.
const LEGACY_NUMBERING_SLUGS = new Set(["5.1", "5.2", "5.2.1", "5.2.2", "5.2.3"]);

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function directParagraphText(blocks: RawBlock[]): string {
  return blocks
    .filter((b): b is RawBlock & { text: string } => b.type === "paragraph" && !!b.text)
    .map((b) => b.text)
    .join("\n\n");
}

async function processNode(topicId: string, chapterNumber: number, numbering: string, title: string, blocks: RawBlock[]): Promise<number> {
  let created = 0;
  const text = directParagraphText(blocks);

  if (text.trim() && !LEGACY_NUMBERING_SLUGS.has(numbering)) {
    const slug = `ch${chapterNumber}_${slugify(title)}`;
    await db
      .insert(concepts)
      .values({ topicId, slug, title, sourceChunk: text, prerequisites: [] })
      .onConflictDoUpdate({ target: concepts.slug, set: { title, sourceChunk: text, topicId } });
    created++;
  }

  for (const b of blocks) {
    if (b.type === "subsection" && b.numbering && b.title) {
      created += await processNode(topicId, chapterNumber, b.numbering, b.title, b.blocks ?? []);
    }
  }
  return created;
}

async function main() {
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => /^chapter-\d{2}\.json$/.test(f))
    .sort();

  for (const file of files) {
    const raw: RawChapterFile = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), "utf-8"));

    const [book] = await db.select().from(books).where(eq(books.slug, raw.book.slug));
    if (!book) throw new Error(`Run npm run seed:book first — book "${raw.book.slug}" not found.`);

    const [chapter] = await db
      .select()
      .from(chapters)
      .where(and(eq(chapters.bookId, book.id), eq(chapters.number, raw.chapter.number)));
    if (!chapter) throw new Error(`Run npm run seed:book first — chapter ${raw.chapter.number} not found.`);

    let created = 0;
    for (const section of raw.sections) {
      if (/^(introduction|summary)$/i.test(section.title)) continue;

      const [topic] = await db
        .select()
        .from(topics)
        .where(and(eq(topics.chapterId, chapter.id), eq(topics.title, section.title)));
      if (!topic) continue; // seed-book-structure.ts should have created this already

      created += await processNode(topic.id, raw.chapter.number, section.numbering, section.title, section.blocks);
    }

    console.log(`✓ Ch.${raw.chapter.number} "${raw.chapter.title}" — ${created} concept(s) created/updated`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
