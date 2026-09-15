"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchCalendar, rescheduleItem } from "@/app/(studio)/studio/calendrier/actions";
import { addDays, dayKey, groupByDay, moveToDay, STATUS_LABEL, TYPE_LABEL, visibleDays, type CalendarItem, type CalendarStatus } from "@/lib/studio/calendar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const STATUS_CLASS: Record<CalendarStatus, string> = {
  draft: "bg-bg-2 text-text-2",
  in_review: "bg-bg-2 text-navy-link",
  scheduled: "bg-bg-2 text-text-1",
  published: "bg-bg-2 text-success",
};
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type Drag = { item: CalendarItem; x: number; y: number; over: string | null };

/**
 * Calendrier éditorial : vues semaine et mois, colonne « Sans date » pour les
 * brouillons, glisser-déposer (pointeur, mobile compris) pour changer la date,
 * tap pour ouvrir l'éditeur.
 */
export function EditorialCalendar({ initial, initialFrom, initialTo }: { initial: CalendarItem[]; initialFrom: string; initialTo: string }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [items, setItems] = useState(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const gridRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const range = useMemo(() => ({ from: days[0], to: addDays(days[days.length - 1], 1) }), [days]);

  // Rechargement quand la fenêtre change (les brouillons sans date sont toujours renvoyés)
  useEffect(() => {
    if (range.from.toISOString() === initialFrom && range.to.toISOString() === initialTo) return;
    let alive = true;
    fetchCalendar(range.from.toISOString(), range.to.toISOString()).then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, [range, initialFrom, initialTo]);

  const { byDay, undated } = useMemo(() => groupByDay(items), [items]);
  const todayKey = dayKey(new Date());

  function shift(n: number) {
    setAnchor((a) => (view === "week" ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)));
  }

  // Glisser-déposer au pointeur : fantôme suit le doigt, dépôt sur la cellule survolée
  function onPointerDown(e: React.PointerEvent, item: CalendarItem) {
    if (item.status === "published") return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
      started = true;
      el.dataset.dragged = "1";
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-day]");
      setDrag({ item, x: ev.clientX, y: ev.clientY, over: under?.dataset.day ?? null });
      ev.preventDefault();
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (!started) return;
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-day]");
      setDrag(null);
      const target = under?.dataset.day;
      if (!target || target === "undated") return;
      const [y, m, d] = target.split("-").map(Number);
      const at = moveToDay(item.at, new Date(y, m - 1, d));
      if (item.at && dayKey(new Date(item.at)) === target) return;
      const previous = items;
      setItems((list) => list.map((x) => (x.id === item.id && x.kind === item.kind ? { ...x, at: at.toISOString(), status: x.status === "draft" ? "scheduled" : x.status } : x)));
      start(async () => {
        const r = await rescheduleItem({ kind: item.kind, id: item.id, at: at.toISOString() });
        if (!r.ok) {
          setItems(previous);
          toast(r.error);
        } else {
          toast("Date mise à jour");
          router.refresh();
        }
      });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  const title = view === "week" ? `Semaine du ${days[0].getDate()} ${MONTHS[days[0].getMonth()]}` : `${MONTHS[anchor.getMonth()][0].toUpperCase()}${MONTHS[anchor.getMonth()].slice(1)} ${anchor.getFullYear()}`;

  return (
    <div className={cn("space-y-4", pending && "opacity-80")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Précédent" className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-bg-1 text-text-2 hover:text-text-1">
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Suivant" className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-bg-1 text-text-2 hover:text-text-1">
            <ChevronRight size={20} strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => setAnchor(new Date())} className="pressable h-10 rounded-full bg-bg-1 px-4 text-[13px] font-medium text-text-2 hover:text-text-1">
            Aujourd&apos;hui
          </button>
        </div>
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em] text-text-1">{title}</h2>
        <div role="tablist" aria-label="Vue" className="flex rounded-full bg-bg-1 p-1">
          {(["week", "month"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("h-8 rounded-full px-4 text-[13px] font-medium", view === v ? "bg-bg-2 text-text-1" : "text-text-2")}>
              {v === "week" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
        <section data-day="undated" className={cn("rounded-[16px] bg-bg-1 p-3", drag?.over === "undated" && "ring-1 ring-glass-edge")}>
          <h3 className="px-1 pb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
            Sans date <span className="text-text-4">{undated.length}</span>
          </h3>
          <ul className="space-y-1.5">
            {undated.map((it) => (
              <Chip key={`${it.kind}-${it.id}`} item={it} onPointerDown={onPointerDown} />
            ))}
            {undated.length === 0 && <li className="px-1 py-2 text-[13px] text-text-3">Aucun brouillon en attente.</li>}
          </ul>
        </section>

        <div ref={gridRef} className={cn("grid gap-1.5", view === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7")}>
          {view === "month" && DAYS.map((d) => <div key={d} className="px-1 pb-1 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-text-3">{d}</div>)}
          {days.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const today = k === todayKey;
            const otherMonth = view === "month" && d.getMonth() !== anchor.getMonth();
            return (
              <section key={k} data-day={k} className={cn("min-h-[84px] rounded-[12px] bg-bg-1 p-1.5", view === "week" && "sm:min-h-[220px]", otherMonth && "opacity-50", drag?.over === k && "ring-1 ring-glass-edge bg-bg-2")}>
                <p className={cn("flex items-center gap-1.5 px-1 pb-1 text-[12px] font-medium", today ? "text-red-text" : "text-text-3")}>
                  {view === "week" ? `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()}` : d.getDate()}
                </p>
                <ul className="space-y-1">
                  {list.map((it) => (
                    <Chip key={`${it.kind}-${it.id}`} item={it} compact={view === "month"} onPointerDown={onPointerDown} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {drag && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-bg-2 px-3 py-1.5 text-[13px] text-text-1 shadow-float" style={{ left: drag.x, top: drag.y }}>
          {drag.item.title}
        </div>
      )}
      <p className="text-[12px] text-text-4">Glissez un élément sur un jour pour le reprogrammer ; un brouillon déposé devient programmé à 9 h. Les contenus publiés ne bougent pas.</p>
    </div>
  );
}

function Chip({ item, compact = false, onPointerDown }: { item: CalendarItem; compact?: boolean; onPointerDown: (e: React.PointerEvent, item: CalendarItem) => void }) {
  const time = item.at ? new Date(item.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <li>
      <Link
        href={item.href}
        draggable={false}
        onPointerDown={(e) => onPointerDown(e, item)}
        onClick={(e) => {
          const el = e.currentTarget as HTMLElement;
          if (el.dataset.dragged) {
            e.preventDefault();
            delete el.dataset.dragged;
          }
        }}
        className={cn("block touch-none select-none rounded-[8px] px-2 py-1 text-[12px] leading-tight", STATUS_CLASS[item.status], item.status !== "published" && "cursor-grab active:cursor-grabbing")}
        title={`${TYPE_LABEL[item.type] ?? item.type} · ${STATUS_LABEL[item.status]}`}
      >
        <span className="block truncate font-medium">{item.title}</span>
        {!compact && (
          <span className="block truncate text-[11px] opacity-80">
            {TYPE_LABEL[item.type] ?? item.type}
            {time && ` · ${time}`} · {STATUS_LABEL[item.status]}
          </span>
        )}
      </Link>
    </li>
  );
}
