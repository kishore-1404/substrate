"use client";

import { useState } from "react";
import Link from "next/link";

interface ConceptRow {
  id: string;
  slug: string;
  title: string;
  experienceId: string | null;
}
interface TopicRow {
  id: string;
  title: string;
  concepts: ConceptRow[];
}
interface ChapterRow {
  id: string;
  number: number;
  title: string;
  topics: TopicRow[];
}
interface LibraryData {
  book: { title: string };
  chapters: ChapterRow[];
}

function ConceptRowView({ concepts }: { concepts: ConceptRow[] }) {
  return concepts.length ? (
    <div className="space-y-2">
      {concepts.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
          <span className="text-sm font-medium">{c.title}</span>
          <Link
            href={c.experienceId ? `/experience/${c.experienceId}` : `/concept/${c.slug}`}
            className="text-sm text-primary underline underline-offset-4"
          >
            {c.experienceId ? "Open experience →" : "Start →"}
          </Link>
        </div>
      ))}
    </div>
  ) : (
    <p className="p-3 text-sm text-muted-foreground">No concepts yet for this topic.</p>
  );
}

export function LibraryBrowser({ data }: { data: LibraryData }) {
  const [chapterId, setChapterId] = useState(data.chapters[0]?.id);
  const chapter = data.chapters.find((c) => c.id === chapterId);

  const [topicId, setTopicId] = useState(chapter?.topics[0]?.id);
  const topic = chapter?.topics.find((t) => t.id === topicId);

  // Below md there's no room for three columns side by side, so mobile gets
  // a proper drill-down instead of all three lists stacked full-height —
  // one screen (chapters, then topics, then concepts) with a back control,
  // the pattern learners already expect from any mobile file/nav browser.
  const [mobilePane, setMobilePane] = useState<"chapters" | "topics" | "concepts">("chapters");

  function selectChapter(id: string) {
    setChapterId(id);
    setTopicId(data.chapters.find((c) => c.id === id)?.topics[0]?.id);
    setMobilePane("topics");
  }

  function selectTopic(id: string) {
    setTopicId(id);
    setMobilePane("concepts");
  }

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <p className="font-mono text-xs text-muted-foreground">
        {data.book.title}
        {chapter && ` / Ch.${chapter.number} ${chapter.title}`}
        {topic && ` / ${topic.title}`}
      </p>

      {/* Mobile drill-down: one pane at a time. */}
      <div className="md:hidden">
        {mobilePane !== "chapters" && (
          <button
            onClick={() => setMobilePane(mobilePane === "concepts" ? "topics" : "chapters")}
            className="mb-3 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ‹ {mobilePane === "concepts" ? "Topics" : "Chapters"}
          </button>
        )}

        {mobilePane === "chapters" && (
          <div className="space-y-1 rounded-lg border p-2">
            {data.chapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => selectChapter(ch.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-3 text-left text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-mono text-xs opacity-70">Ch.{ch.number}</span>
                  <br />
                  {ch.title}
                </span>
                <span className="shrink-0 text-muted-foreground">›</span>
              </button>
            ))}
          </div>
        )}

        {mobilePane === "topics" && (
          <div className="space-y-1 rounded-lg border p-2">
            {chapter?.topics.length ? (
              chapter.topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTopic(t.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-3 text-left text-sm hover:bg-muted"
                >
                  {t.title}
                  <span className="shrink-0 text-muted-foreground">›</span>
                </button>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">No topics yet for this chapter.</p>
            )}
          </div>
        )}

        {mobilePane === "concepts" && <ConceptRowView concepts={topic?.concepts ?? []} />}
      </div>

      {/* md+: three columns side by side, all always visible. */}
      <div className="hidden gap-4 md:grid md:grid-cols-[220px_230px_1fr]">
        <div className="space-y-1 rounded-lg border p-2">
          {data.chapters.map((ch) => (
            <button
              key={ch.id}
              onClick={() => selectChapter(ch.id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                ch.id === chapterId ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="font-mono text-xs opacity-70">Ch.{ch.number}</span>
              <br />
              {ch.title}
            </button>
          ))}
        </div>

        <div className="space-y-1 rounded-lg border p-2">
          {chapter?.topics.length ? (
            chapter.topics.map((t) => (
              <button
                key={t.id}
                onClick={() => setTopicId(t.id)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  t.id === topicId ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {t.title}
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">No topics yet for this chapter.</p>
          )}
        </div>

        <div className="rounded-lg border p-3">
          <ConceptRowView concepts={topic?.concepts ?? []} />
        </div>
      </div>
    </div>
  );
}
