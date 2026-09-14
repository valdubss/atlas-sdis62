"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/config";
import { cn } from "@/lib/cn";

const ICONS: Record<(typeof NAV_ITEMS)[number]["icon"], React.ReactNode> = {
  feed: (
    <path d="M4 5h16M4 12h16M4 19h10" strokeLinecap="round" />
  ),
  gallery: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>
  ),
  bookmark: <path d="M6 4h12v17l-6-4-6 4V4z" strokeLinejoin="round" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
    </>
  ),
};

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-red/20")}>
                <svg
                  viewBox="0 0 24 24"
                  className={cn("h-6 w-6", active && "text-red-text")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : 1.8}
                  aria-hidden="true"
                >
                  {ICONS[item.icon]}
                </svg>
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
