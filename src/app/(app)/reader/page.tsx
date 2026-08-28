import { PdfReader } from "@/components/reader/pdf-reader";

export default function ReaderPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs text-muted-foreground">READER</p>
        <h1 className="text-2xl font-semibold">Your book, your PDF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a PDF from your device. It stays on your device — nothing is uploaded — and reopens automatically next
          time you come back. Ask questions about whatever page you&apos;re on.
        </p>
      </div>
      <PdfReader />
    </div>
  );
}
