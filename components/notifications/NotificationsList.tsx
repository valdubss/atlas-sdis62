"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { AlertTriangle, FileText, CalendarDays, MessageCircle, Newspaper, Reply, MessageSquare, Flame, BookUser, Trash2, type LucideIcon, AtSign } from "lucide-react";
import type { NotificationItem } from "@/lib/notifications/queries";
import { deleteNotification, markAllRead } from "@/app/(app)/notifications/actions";
import { useToast } from "@/components/ui/Toast";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = { post: Newspaper, flash: AlertTriangle, reply: Reply, event: CalendarDays, story_reply: MessageCircle, message: MessageSquare, center: Flame, directory: BookUser, membership: Flame, coeditor: Newspaper, note: FileText, mention: AtSign };

/** Seuil de balayage (px) au-delà duquel la notification est supprimée. */
const SWIPE_DELETE = 96;

/** Liste des notifications ; tout est marqué lu à l'ouverture ; balayer vers la gauche supprime. */
export function NotificationsList({ items: initialItems, unread }: { items: NotificationItem[]; unread: number }) {
  const router = useRouter();
  const toast = useToast();
  const reduced = useReducedMotion();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  // Non-lues à l'ouverture : restent mises en avant (et filtrables) pendant la visite,
  // même une fois marquées lues en base
  const [freshIds] = useState(() => new Set(initialItems.filter((n) => !n.read_at).map((n) => n.id)));
  useEffect(() => setItems(initialItems), [initialItems]);

  function remove(n: NotificationItem) {
    // Retrait immédiat, suppression en base ensuite ; rétabli si elle échoue
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    deleteNotification(n.id).then((r) => {
      if (!r.ok) {
        setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [...prev, n].sort((a, b) => b.created_at.localeCompare(a.created_at))));
        toast("Suppression impossible pour le moment.");
      }
    });
  }
  useEffect(() => {
    if (unread > 0) {
      const t = setTimeout(() => markAllRead().then(() => router.refresh()), 1500);
      return () => clearTimeout(t);
    }
  }, [unread, router]);

  if (items.length === 0) return <EmptyState title="Aucune notification" description="Les nouvelles publications, flashs, rappels d'événements et réponses à vos commentaires des 90 derniers jours apparaîtront ici." />;
  const shown = filter === "unread" ? items.filter((n) => freshIds.has(n.id)) : items;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Filtre" className="flex w-fit rounded-full bg-bg-1 p-1">
        {(["all", "unread"] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("h-8 rounded-full px-4 text-[13px] font-medium", filter === f ? "bg-bg-2 text-text-1" : "text-text-2")}>
            {f === "all" ? "Toutes" : `Non lues${freshIds.size ? ` (${freshIds.size})` : ""}`}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="px-1 py-6 text-center text-[15px] text-text-2">Tout est lu.</p>}
    <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
      <AnimatePresence initial={false}>
      {shown.map((n) => {
        const Icon = ICONS[n.kind] ?? Newspaper;
        const fresh = freshIds.has(n.id);
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
        const onDragEnd = (_: unknown, info: PanInfo) => {
          if (info.offset.x < -SWIPE_DELETE || info.velocity.x < -600) remove(n);
        };
        return (
          <motion.li
            key={n.id}
            layout={!reduced}
            initial={false}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -80, transition: { duration: 0.18 } }}
            className="relative overflow-hidden"
          >
            {/* Fond révélé par le balayage : corbeille à droite */}
            <div className="absolute inset-0 flex items-center justify-end bg-red-soft pr-5 text-red-text" aria-hidden="true">
              <Trash2 size={20} strokeWidth={1.75} />
            </div>
            <motion.div
              drag={reduced ? false : "x"}
              dragConstraints={{ left: -160, right: 0 }}
              dragElastic={{ left: 0.2, right: 0 }}
              dragSnapToOrigin
              onDragEnd={onDragEnd}
              className="relative bg-bg-1"
            >
              {n.url ? (
                <Link href={n.url} draggable={false} className="pressable flex items-start gap-3 px-4 py-3">
                  {inner}
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-4 py-3">{inner}</div>
              )}
            </motion.div>
            <button type="button" onClick={() => remove(n)} aria-label={`Supprimer la notification : ${n.title}`} className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:rounded-[8px] focus:bg-bg-2 focus:px-2 focus:py-1 focus:text-[13px] focus:text-text-1">
              Supprimer
            </button>
          </motion.li>
        );
      })}
      </AnimatePresence>
    </ul>
    </div>
  );
}
