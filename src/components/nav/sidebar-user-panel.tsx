"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModelSettingsSheet } from "./model-settings-sheet";

interface ContinueCard {
  breadcrumb: string;
  title: string;
  href: string;
}

export function SidebarUserPanel({
  currentUserId,
  currentUserName,
  daysActive,
  continueCard,
  otherUsers,
  llmProvider,
  llmModel,
}: {
  currentUserId: string;
  currentUserName: string;
  daysActive: number;
  continueCard: ContinueCard | null;
  otherUsers: { id: string; name: string }[];
  llmProvider: string;
  llmModel: string | null;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);

  const initials = currentUserName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function switchUser(userId: string) {
    await fetch("/api/auth/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth");
    router.refresh();
  }

  return (
    <>
      {continueCard && (
        <div className="mt-5 rounded-[10px] border border-primary/30 bg-accent p-3.5">
          <p className="mb-1.5 font-mono text-[10px] font-semibold tracking-wide text-accent-foreground">CONTINUE</p>
          <p className="mb-0.5 text-sm font-semibold leading-tight">{continueCard.title}</p>
          <p className="mb-2.5 text-xs text-muted-foreground">{continueCard.breadcrumb}</p>
          <Link href={continueCard.href} className="text-xs font-semibold text-accent-foreground">
            Resume →
          </Link>
        </div>
      )}

      <div className="flex-1" />

      <div className="relative">
        {menuOpen && (
          <div className="absolute bottom-14 left-2 right-2 z-10 flex flex-col gap-0.5 rounded-[10px] border bg-card p-2 shadow-lg">
            <p className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">SWITCH USER</p>
            {otherUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => switchUser(u.id)}
                className={`rounded-[7px] px-2.5 py-2 text-left text-sm font-medium hover:bg-muted ${
                  u.id === currentUserId ? "text-accent-foreground" : ""
                }`}
              >
                {u.name}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              onClick={() => {
                setModelSheetOpen(true);
                setMenuOpen(false);
              }}
              className="rounded-[7px] px-2.5 py-2 text-left text-sm font-medium hover:bg-muted"
            >
              Model settings
            </button>
            <button onClick={logout} className="rounded-[7px] px-2.5 py-2 text-left text-sm font-semibold text-destructive hover:bg-muted">
              Log out
            </button>
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-lg border-t px-2 py-2.5 pt-3"
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
          <span className="flex flex-col items-start">
            <span className="text-sm font-semibold">{currentUserName}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{daysActive}-day active</span>
          </span>
        </button>
      </div>

      <ModelSettingsSheet
        open={modelSheetOpen}
        onOpenChange={setModelSheetOpen}
        currentProvider={llmProvider}
        currentModel={llmModel}
      />
    </>
  );
}
