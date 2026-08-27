export default function Loading() {
  return (
    <div className="flex max-w-4xl flex-col gap-[22px]">
      <div className="flex items-baseline justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-72 animate-pulse rounded bg-muted" />
          <div className="h-6 w-56 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 flex-1 animate-pulse rounded bg-muted/40" />
        ))}
      </div>
      <div className="h-64 w-full animate-pulse rounded-xl border bg-muted/40" />
    </div>
  );
}
