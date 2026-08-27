export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_230px_1fr]">
        <div className="h-[500px] animate-pulse rounded-lg border bg-muted/40" />
        <div className="h-[500px] animate-pulse rounded-lg border bg-muted/40" />
        <div className="h-[500px] animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  );
}
