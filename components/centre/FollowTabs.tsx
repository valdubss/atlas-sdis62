import Link from "next/link";
import type { CenterSummary } from "@/lib/centres/public";
import { cn } from "@/lib/cn";

/** Onglets horizontaux : rattachement en premier, puis les centres suivis. */
export function FollowTabs({ home, follows, currentSlug }: { home: CenterSummary | null; follows: CenterSummary[]; currentSlug: string }) {
  const tabs = [...(home ? [home] : []), ...follows.filter((f) => f.id !== home?.id)];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Centres suivis" className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:-mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.slug === currentSlug;
        return (
          <Link key={t.id} href={`/centre/${t.slug}`} aria-current={active ? "page" : undefined} className={cn("pressable h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-medium leading-9", active ? "bg-red-soft text-text-1" : "bg-bg-1 text-text-2")}>
            {t.name}
          </Link>
        );
      })}
    </nav>
  );
}
