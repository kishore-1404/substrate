export default function Loading() {
  return (
    <div className="flex max-w-[760px] flex-col gap-7">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="flex gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 flex-1 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-6 w-full animate-pulse rounded bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
