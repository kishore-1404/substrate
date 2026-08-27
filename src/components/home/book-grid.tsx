"use client";

import { useState } from "react";
import Link from "next/link";

interface BookRow {
  title: string;
  short: string;
  href: string | null;
}

// Matches the mockup's "Your library" pattern: unlocked books navigate,
// locked ones surface a dismissible notice instead of silently no-op'ing.
export function BookGrid({ books }: { books: BookRow[] }) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3.5">
      {notice && (
        <div className="flex items-center gap-2.5 rounded-[9px] border border-destructive/40 bg-destructive/10 px-3.5 py-2.5">
          <p className="flex-1 text-[13px] font-medium text-destructive">{notice}</p>
          <button onClick={() => setNotice(null)} className="font-semibold text-destructive">
            ×
          </button>
        </div>
      )}
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {books.map((b) => {
          const content = (
            <>
              <div
                className="mb-2 flex h-[110px] items-center justify-center rounded-[10px] border"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, var(--muted) 0 10px, var(--border) 10px 20px)",
                }}
              >
                <span className="font-mono text-[11px] font-semibold text-muted-foreground">{b.short}</span>
              </div>
              <p className="text-[13px] font-medium leading-tight">{b.title}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{b.href ? "In progress" : "Locked"}</p>
            </>
          );
          return b.href ? (
            <Link key={b.title} href={b.href} className="w-[170px] shrink-0">
              {content}
            </Link>
          ) : (
            <button
              key={b.title}
              onClick={() => setNotice(`${b.title} hasn't been added to your library yet.`)}
              className="w-[170px] shrink-0 text-left opacity-55"
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
