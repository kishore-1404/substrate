export default function Loading() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-72 animate-pulse rounded bg-muted" />
        <div className="h-6 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-16 w-full animate-pulse rounded-lg border bg-muted/40" />
      <div className="h-80 w-full animate-pulse rounded-lg border bg-muted/40" />
    </div>
  );
}
