"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, MessageCircle, Newspaper, Reply, MessageSquare, Flame, BookUser, type LucideIcon } from "lucide-react";
import type { NotificationItem } from "@/lib/notifications/queries";
import { markAllRead } from "@/app/(app)/notifications/actions";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = { post: Newspaper, flash: AlertTriangle, reply: Reply, event: CalendarDays, story_reply: MessageCircle, message: MessageSquare, center: Flame, directory: BookUser };

/** Liste des notifications ; tout est marqué lu à l'ouverture. */
export function NotificationsList({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  useEffect(() => {
    if (unread > 0) {
      const t = setTimeout(() => markAllRead().then(() => router.refresh()), 1500);
      return () => clearTimeout(t);
    }
  }, [unread, router]);

  if (items.length === 0) return <EmptyState title="Aucune notification" description="Les nouvelles publications, flashs, rappels d'événements et réponses à vos commentaires des 90 derniers jours apparaîtront ici." />;
  const shown = filter === "unread" ? items.filter((n) => !n.read_at) : items;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Filtre" className="flex w-fit rounded-full bg-bg-1 p-1">
        {(["all", "unread"] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("h-8 rounded-full px-4 text-[13px] font-medium", filter === f ? "bg-bg-2 text-text-1" : "text-text-2")}>
            {f === "all" ? "Toutes" : `Non lues${unread ? ` (${unread})` : ""}`}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="px-1 py-6 text-center text-[15px] text-text-2">Tout est lu.</p>}
    <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
      {shown.map((n) => {
        const Icon = ICONS[n.kind] ?? Newspaper;
        const fresh = !n.read_at;
        const inner = (
          <>
            <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.kind === "flash" ? "bg-red-soft text-red-text" : "bg-bg-2 text-text-2")}>
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[15px] leading-snug", fresh ? "font-semibold text-text-1" : "text-text-1")}>{n.title}</span>
              {n.body && <span className="mt-0.5 block truncate text-[13px] text-text-2">{n.body}</span>}
              <span className="mt-0.5 block text-[12px] text-text-3">{formatRelative(n.created_at)}</span>
            </span>
            {fresh && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red" aria-label="Non lue" />}
          </>
        );
        return (
          <li key={n.id}>
            {n.url ? (
              <Link href={n.url} className="pressable flex items-start gap-3 px-4 py-3">
                {inner}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
    </div>
  );
}
