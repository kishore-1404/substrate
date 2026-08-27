// Seeds the full DDIA Book -> Chapter -> Topic hierarchy from the actual
// parsed output in ingestion/ddia/_raw/chapter-*.json — real chapter and
// section titles pulled mechanically from the book, not invented. This is
// distinct from ingest-concepts.ts: that script curates Concepts (with
// sourceChunk excerpts) for the one topic we've done concept-extraction on;
// this script just makes the rest of the Library's Book/Chapter/Topic
// structure real instead of only chapter 5 existing.
//
// Concepts are intentionally NOT created here for chapters other than 5 —
// per book_ingestion_spec.md §1, concept identification is a curation step,
// not mechanical, and hasn't been done for chapters 1-4/6-12 yet. Their
// Topics will show with no Concepts/Experiences until that curation happens.
import fs from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { db } from "./client";
import { books, chapters, topics } from "./schema";

const RAW_DIR = path.resolve(__dirname, "../../../../ingestion/ddia/_raw");

interface RawChapterFile {
  book: { slug: string; title: string; author: string };
  chapter: { number: number; title: string; startPage: number; endPage: number };
  sections: { numbering: string; title: string }[];
}

async function main() {
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => /^chapter-\d{2}\.json$/.test(f))
    .sort();

  if (files.length === 0) throw new Error(`No parsed chapter files found in ${RAW_DIR}`);

  let bookRow: { id: string; slug: string } | undefined;

  for (const file of files) {
    const raw: RawChapterFile = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), "utf-8"));

    if (!bookRow) {
      const [existing] = await db.select().from(books).where(eq(books.slug, raw.book.slug));
      bookRow =
        existing ??
        (await db.insert(books).values({ slug: raw.book.slug, title: raw.book.title, author: raw.book.author }).returning())[0];
    }

    const [existingChapter] = await db
      .select()
      .from(chapters)
      .where(and(eq(chapters.bookId, bookRow.id), eq(chapters.number, raw.chapter.number)));
    const chapter =
      existingChapter ??
      (await db
        .insert(chapters)
        .values({ bookId: bookRow.id, number: raw.chapter.number, title: raw.chapter.title })
        .returning())[0];

    let created = 0;
    for (const section of raw.sections) {
      // Skip "Introduction" and "Summary" — DDIA's own bookends, not
      // teachable topics with concepts underneath them.
      if (/^(introduction|summary)$/i.test(section.title)) continue;

      const [existingTopic] = await db
        .select()
        .from(topics)
        .where(and(eq(topics.chapterId, chapter.id), eq(topics.title, section.title)));
      if (!existingTopic) {
        await db.insert(topics).values({ chapterId: chapter.id, title: section.title });
        created++;
      }
    }

    console.log(`✓ Ch.${raw.chapter.number} "${raw.chapter.title}" — ${created} new topic(s) (${raw.sections.length} sections in book)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
