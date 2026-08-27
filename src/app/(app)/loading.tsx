export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-muted" />
      <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
