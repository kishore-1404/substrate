export function SidebarUserPanelSkeleton() {
  return (
    <>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 border-t px-2 pt-3">
        <span className="h-[30px] w-[30px] shrink-0 animate-pulse rounded-full bg-muted" />
        <span className="flex flex-col gap-1.5">
          <span className="h-3 w-20 animate-pulse rounded bg-muted" />
          <span className="h-2.5 w-16 animate-pulse rounded bg-muted" />
        </span>
      </div>
    </>
  );
}
