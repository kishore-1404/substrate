"use client";

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
export function SidebarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Library", href: "/library" },
    { label: "Progress", href: "/progress" },
  ];

  return (
    <div className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col border-r bg-sidebar px-4 py-[22px]">
      <div className="flex items-center justify-between px-2 pb-[26px]">
        <div className="flex items-center gap-[9px]">
          <div className="h-[9px] w-[9px] rounded-[2px] bg-primary" />
          <span className="font-mono text-[13px] font-semibold tracking-wide">SUBSTRATE</span>
        </div>
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          suppressHydrationWarning
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <span suppressHydrationWarning>{resolvedTheme === "dark" ? "☀" : "☾"}</span>
        </button>
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
  );
}
