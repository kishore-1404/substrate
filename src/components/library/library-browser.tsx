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

export function LibraryBrowser({ data }: { data: LibraryData }) {
  const [chapterId, setChapterId] = useState(data.chapters[0]?.id);
  const chapter = data.chapters.find((c) => c.id === chapterId);

  const [topicId, setTopicId] = useState(chapter?.topics[0]?.id);
  const topic = chapter?.topics.find((t) => t.id === topicId);

  function selectChapter(id: string) {
    setChapterId(id);
    setTopicId(data.chapters.find((c) => c.id === id)?.topics[0]?.id);
  }

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <p className="font-mono text-xs text-muted-foreground">
        {data.book.title}
        {chapter && ` / Ch.${chapter.number} ${chapter.title}`}
        {topic && ` / ${topic.title}`}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_230px_1fr]">
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

        <div className="space-y-2 rounded-lg border p-3">
          {topic?.concepts.length ? (
            topic.concepts.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">{c.title}</span>
                <Link
                  href={c.experienceId ? `/experience/${c.experienceId}` : `/concept/${c.slug}`}
                  className="text-sm text-primary underline underline-offset-4"
                >
                  {c.experienceId ? "Open experience →" : "Start →"}
                </Link>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No concepts yet for this topic.</p>
          )}
        </div>
      </div>
    </div>
  );
}
