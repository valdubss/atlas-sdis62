"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, MessageCircle, Newspaper, Reply } from "lucide-react";
import type { NotificationItem } from "@/lib/notifications/queries";
import { markAllRead } from "@/app/(app)/notifications/actions";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

const ICONS = { post: Newspaper, flash: AlertTriangle, reply: Reply, event: CalendarDays, story_reply: MessageCircle } as const;

/** Liste des notifications ; tout est marqué lu à l'ouverture. */
export function NotificationsList({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unread > 0) markAllRead().then(() => router.refresh());
  }, [unread, router]);

  if (items.length === 0) return <EmptyState title="Aucune notification" description="Les nouvelles publications, flashs, rappels d'événements et réponses à vos commentaires apparaîtront ici." />;

  return (
    <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
      {items.map((n) => {
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
  );
}
