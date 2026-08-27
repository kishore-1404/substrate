import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { SidebarShell } from "@/components/nav/sidebar-shell";
import { SidebarUserPanelServer } from "@/components/nav/sidebar-user-panel-server";
import { SidebarUserPanelSkeleton } from "@/components/nav/sidebar-user-panel-skeleton";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Only a cookie read, no DB — the auth gate itself never blocks on a
  // round trip. All the sidebar's actual data lives behind the Suspense
  // boundary below, and the page's own content (children) streams
  // concurrently with it rather than waiting in line behind it.
  const userId = await getSessionUserId();
  if (!userId) redirect("/auth");

  return (
    <div className="flex min-h-screen">
      <SidebarShell>
        <Suspense fallback={<SidebarUserPanelSkeleton />}>
          <SidebarUserPanelServer userId={userId} />
        </Suspense>
      </SidebarShell>
      <main className="max-w-[1440px] flex-1 overflow-x-auto px-12 py-10">{children}</main>
    </div>
  );
}
