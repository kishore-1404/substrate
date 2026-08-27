"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Shown when the sidebar's own data fetch fails even after a retry — the
// rest of the app (nav, current page) still works, so this must not crash
// it. No continue card / avatar / streak (we don't have that data), but
// logout and a manual retry both still work without needing it.
export function SidebarUserPanelDegraded() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth");
    router.refresh();
  }

  return (
    <>
      <div className="flex-1" />
      <div className="flex flex-col gap-2 border-t px-2 pt-3">
        <p className="text-xs text-muted-foreground">Couldn&apos;t load account details.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            Retry
          </Button>
          <Button size="sm" variant="outline" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    </>
  );
}
