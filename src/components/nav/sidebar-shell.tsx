"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

// The part of the sidebar that never needs a DB round trip — brand, nav
// links, theme toggle. Renders instantly on every navigation; the
// user-specific panel (continue card, avatar, switch-user) is a separate
// Suspense-streamed server component passed in as `children`, so a slow
// query for "what should the continue card say" never blocks the nav itself
// from appearing — this is the fix for "fetching on every screen change
// causing visible lag."
//
// Below the `lg` breakpoint the 248px column doesn't fit alongside real
// content, so it becomes an off-canvas drawer: a fixed top bar (brand +
// hamburger) replaces it in the layout flow, and the drawer itself slides
// in over a backdrop. At `lg` and above it's back to the original sticky
// column, untouched.
export function SidebarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // A navigation changes the page under the drawer — close it so the next
  // screen isn't hidden behind an open overlay.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Library", href: "/library" },
    { label: "Progress", href: "/progress" },
  ];

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b bg-sidebar px-4 py-3 lg:hidden">
        <div className="flex items-center gap-[9px]">
          <div className="h-[9px] w-[9px] rounded-[2px] bg-primary" />
          <span className="font-mono text-[13px] font-semibold tracking-wide">SUBSTRATE</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <span className="text-lg leading-none">☰</span>
        </button>
      </div>

      {open && (
        <div
          role="presentation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[248px] shrink-0 flex-col border-r bg-sidebar px-4 py-[22px] transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-[26px]">
          <div className="flex items-center gap-[9px]">
            <div className="h-[9px] w-[9px] rounded-[2px] bg-primary" />
            <span className="font-mono text-[13px] font-semibold tracking-wide">SUBSTRATE</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              suppressHydrationWarning
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <span suppressHydrationWarning>{resolvedTheme === "dark" ? "☀" : "☾"}</span>
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground lg:hidden"
            >
              ×
            </button>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </>
  );
}
