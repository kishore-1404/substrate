"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deletePdfFile,
  listPdfFiles,
  pdfFileId,
  savePdfFile,
  updatePdfLastPage,
  type StoredPdfFile,
} from "@/lib/offline-library";
import { useSwipeToDismiss } from "@/lib/use-swipe-to-dismiss";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// pdf.js only runs in the browser (it touches canvas/worker APIs), and its
// own module load is a few hundred KB — dynamic-import it lazily on first
// use rather than pulling it into the main bundle for every page.
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

export function PdfReader() {
  const [library, setLibrary] = useState<StoredPdfFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [doc, setDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.1);
  const [pageText, setPageText] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [askOpen, setAskOpen] = useState(false);
  const askSwipe = useSwipeToDismiss(() => setAskOpen(false));
  const [askInput, setAskInput] = useState("");
  const [askMessages, setAskMessages] = useState<ChatMsg[]>([]);
  const [asking, setAsking] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listPdfFiles().then((files) => setLibrary(files.sort((a, b) => b.savedAt - a.savedAt)));
  }, []);

  const openFromBlob = useCallback(async (id: string, blob: Blob, resumePage: number) => {
    setLoadingDoc(true);
    setRenderError(null);
    try {
      const pdfjs = await loadPdfjs();
      const buf = await blob.arrayBuffer();
      const loaded = await pdfjs.getDocument({ data: buf }).promise;
      setDoc(loaded);
      setNumPages(loaded.numPages);
      setActiveId(id);
      setPageNum(Math.min(Math.max(1, resumePage || 1), loaded.numPages));
      setAskMessages([]);
    } catch {
      setRenderError("Couldn't open this PDF — it may be corrupted or password-protected.");
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  async function handleFileChosen(file: File) {
    const id = pdfFileId(file.name, file.size);
    await savePdfFile({ id, name: file.name, size: file.size, file, lastPage: 1 });
    setLibrary((prev) => [{ id, name: file.name, size: file.size, file, lastPage: 1, savedAt: Date.now() }, ...prev.filter((f) => f.id !== id)]);
    await openFromBlob(id, file, 1);
  }

  async function openSaved(entry: StoredPdfFile) {
    await openFromBlob(entry.id, entry.file, entry.lastPage);
  }

  async function forgetSaved(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deletePdfFile(id);
    setLibrary((prev) => prev.filter((f) => f.id !== id));
    if (activeId === id) {
      setDoc(null);
      setActiveId(null);
    }
  }

  // Render the current page to canvas + pull its text for the AI panel.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const content = await page.getTextContent();
      if (cancelled) return;
      const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      setPageText(text);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum, zoom]);

  useEffect(() => {
    if (activeId) void updatePdfLastPage(activeId, pageNum);
  }, [activeId, pageNum]);

  function goTo(next: number) {
    setPageNum((p) => Math.min(Math.max(1, next), numPages || p));
  }

  async function ask() {
    const question = askInput.trim();
    if (!question || asking) return;
    setAskInput("");
    setAsking(true);
    const nextMessages: ChatMsg[] = [...askMessages, { role: "user", content: question }];
    setAskMessages(nextMessages);
    try {
      const res = await fetch("/api/pdf/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageText,
          pageLabel: `page ${pageNum} of ${library.find((f) => f.id === activeId)?.name ?? "this PDF"}`,
          question,
          history: askMessages,
        }),
      });
      const json = await res.json();
      setAskMessages([...nextMessages, { role: "assistant", content: json.reply ?? "Something went wrong." }]);
    } catch {
      setAskMessages([...nextMessages, { role: "assistant", content: "Network error — try again." }]);
    } finally {
      setAsking(false);
    }
  }

  if (!doc) {
    return (
      <div className="flex flex-col gap-5">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center hover:border-primary/60"
        >
          <p className="text-sm font-medium">Click to choose a PDF from your device</p>
          <p className="text-xs text-muted-foreground">Stored locally only — never uploaded.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChosen(file);
              e.target.value = "";
            }}
          />
        </div>
        {renderError && <p className="text-sm text-destructive">{renderError}</p>}
        {loadingDoc && <p className="text-sm text-muted-foreground">Opening…</p>}

        {library.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">SAVED ON THIS DEVICE</p>
            {library.map((f) => (
              <div
                key={f.id}
                onClick={() => openSaved(f)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 hover:border-primary/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">Resume at page {f.lastPage}</p>
                </div>
                <button
                  onClick={(e) => forgetSaved(f.id, e)}
                  className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                  aria-label={`Forget ${f.name}`}
                >
                  Forget
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => goTo(pageNum - 1)} disabled={pageNum <= 1}>
              ‹
            </Button>
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {pageNum} / {numPages}
            </span>
            <Button size="sm" variant="ghost" onClick={() => goTo(pageNum + 1)} disabled={pageNum >= numPages}>
              ›
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>
              −
            </Button>
            <span className="w-10 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}>
              +
            </Button>
            <Button size="sm" onClick={() => setAskOpen(true)}>
              Ask AI
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDoc(null);
                setActiveId(null);
              }}
            >
              Close
            </Button>
          </div>
        </div>

        <div className="w-full overflow-auto rounded-xl border bg-muted/30 p-2 sm:p-4">
          <canvas ref={canvasRef} className="mx-auto max-w-full" />
        </div>
      </div>

      {askOpen && (
        <>
          <div role="presentation" onClick={() => setAskOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <aside
            className="fixed inset-x-0 bottom-0 z-50 flex h-[70vh] w-full flex-col rounded-t-2xl border bg-card p-4 shadow-lg lg:sticky lg:inset-auto lg:top-10 lg:z-auto lg:h-fit lg:max-h-[calc(100vh-80px)] lg:w-[340px] lg:shrink-0 lg:rounded-2xl"
            style={askSwipe.dragY ? { transform: `translateY(${askSwipe.dragY}px)` } : undefined}
          >
            <div {...askSwipe.handlers} className="-mt-1 mb-1 flex justify-center py-1 lg:hidden">
              <div className="h-1 w-9 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">ASK ABOUT THIS PAGE</p>
              <button onClick={() => setAskOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                ×
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {askMessages.length === 0 && (
                <p className="text-xs text-muted-foreground">Ask anything about page {pageNum} — the model reads its extracted text.</p>
              )}
              {askMessages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-accent" : "bg-muted"}`}
                >
                  {m.content}
                </div>
              ))}
              {asking && <p className="text-xs text-muted-foreground">Thinking…</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="What does this mean?"
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <Button size="sm" onClick={ask} disabled={asking || !askInput.trim()}>
                Send
              </Button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
