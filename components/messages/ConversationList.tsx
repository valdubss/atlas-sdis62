"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { motion, useReducedMotion, type PanInfo } from "framer-motion";
import { BellOff, EyeOff, Pin, Plus, Search } from "lucide-react";
import type { Conversation } from "@/lib/messages/types";
import { conversationPreview, shortTime } from "@/lib/messages/helpers";
import { listConversations, setChannelPrefs } from "@/app/(app)/messages/actions";
import { AvatarMosaic } from "./AvatarMosaic";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

type Segment = "all" | "unread" | "groups" | "centers";
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "unread", label: "Non lus" },
  { key: "groups", label: "Groupes" },
  { key: "centers", label: "Centres" },
];

/**
 * Liste des conversations : avatar 52 px (ou mosaïque), nom, aperçu, heure,
 * pastille de non-lus, épingle, son coupé. Glisser à droite = épingler,
 * glisser à gauche = silence / masquer. Section « Archivés » repliée.
 */
export function ConversationList({ initial, canCreate }: { initial: Conversation[]; canCreate: boolean }) {
  const [list, setList] = useState(initial);
  const [segment, setSegment] = useState<Segment>("all");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  // Rafraîchissement au retour sur l'onglet et toutes les 30 s
  useEffect(() => {
    let alive = true;
    const refresh = () => listConversations().then((l) => alive && setList(l)).catch(() => {});
    const t = setInterval(refresh, 30_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((c) => {
      if (needle && !c.name.toLowerCase().includes(needle) && !(c.subject ?? "").toLowerCase().includes(needle)) return false;
      if (segment === "unread") return c.unread > 0;
      if (segment === "groups") return c.type === "group";
      if (segment === "centers") return c.type === "center" || c.type === "grouping";
      return true;
    });
  }, [list, segment, q]);
  const active = filtered.filter((c) => !c.archived_at);
  const archived = filtered.filter((c) => c.archived_at);

  function update(id: string, patch: Partial<Conversation>) {
    setList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function act(c: Conversation, what: "pin" | "mute" | "hide") {
    start(async () => {
      const r =
        what === "pin"
          ? await setChannelPrefs(c.id, { pinned: !c.pinned })
          : what === "mute"
            ? await setChannelPrefs(c.id, { mute_hours: c.muted_until && new Date(c.muted_until).getTime() > Date.now() ? 0 : 8 })
            : await setChannelPrefs(c.id, { hidden: true });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      if (what === "pin") {
        update(c.id, { pinned: !c.pinned });
        toast(c.pinned ? "Conversation désépinglée" : "Conversation épinglée");
      } else if (what === "mute") {
        const muted = c.muted_until && new Date(c.muted_until).getTime() > Date.now();
        update(c.id, { muted_until: muted ? null : new Date(Date.now() + 8 * 3_600_000).toISOString() });
        toast(muted ? "Notifications rétablies" : "En silence pour 8 h");
      } else {
        setList((prev) => prev.filter((x) => x.id !== c.id));
        toast("Conversation masquée jusqu'au prochain message");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="relative block flex-1">
          <Search size={18} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une conversation" aria-label="Rechercher une conversation" className="h-11 w-full rounded-[12px] bg-bg-1 pl-10 pr-3 text-[15px] text-text-1 outline-none placeholder:text-text-3" />
        </label>
        {canCreate && (
          <Link href="/messages/nouveau" aria-label="Nouveau groupe" className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-bg-1 text-text-1">
            <Plus size={22} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3" role="tablist" aria-label="Filtres">
        {SEGMENTS.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={segment === s.key} onClick={() => setSegment(s.key)} className={cn("h-9 shrink-0 rounded-full px-4 text-[13px] font-medium", segment === s.key ? "bg-bg-2 text-text-1" : "bg-bg-1 text-text-2")}>
            {s.label}
            {s.key === "unread" && list.some((c) => c.unread > 0) && <span className="ml-1.5 text-red-text">{list.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0)}</span>}
          </button>
        ))}
      </div>

      {active.length === 0 ? (
        <EmptyState title={segment === "unread" ? "Rien de nouveau" : "Aucune conversation"} description={segment === "unread" ? "Vous êtes à jour." : canCreate ? "Créez un groupe avec le bouton +." : "Les conversations auxquelles vous êtes invité apparaîtront ici."} />
      ) : (
        <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1" aria-label="Conversations">
          {active.map((c) => (
            <Row key={c.id} c={c} disabled={pending} onAct={(what) => act(c, what)} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="flex h-10 items-center gap-2 text-[13px] font-medium text-text-2">
            Archivés <span className="text-text-3">{archived.length}</span>
          </button>
          {showArchived && (
            <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
              {archived.map((c) => (
                <Row key={c.id} c={c} disabled />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Row({ c, disabled, onAct }: { c: Conversation; disabled?: boolean; onAct?: (what: "pin" | "mute" | "hide") => void }) {
  const reduced = useReducedMotion();
  const muted = Boolean(c.muted_until && new Date(c.muted_until).getTime() > Date.now());
  const preview = conversationPreview(c);
  function onDragEnd(_: unknown, info: PanInfo) {
    if (!onAct) return;
    if (info.offset.x > 90) onAct("pin");
    else if (info.offset.x < -90) onAct(Math.abs(info.offset.x) > 180 ? "hide" : "mute");
  }
  return (
    <li className="relative overflow-hidden">
      {onAct && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-between px-5 text-[13px] font-medium text-text-2">
          <span className="flex items-center gap-1.5">
            <Pin size={16} strokeWidth={1.75} /> {c.pinned ? "Désépingler" : "Épingler"}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <BellOff size={16} strokeWidth={1.75} /> {muted ? "Réactiver" : "Silence"}
            </span>
            <span className="flex items-center gap-1.5">
              <EyeOff size={16} strokeWidth={1.75} /> Masquer
            </span>
          </span>
        </div>
      )}
      <motion.div drag={onAct && !reduced ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4} onDragEnd={onDragEnd} className="relative bg-bg-1">
        <Link href={`/messages/${c.id}`} className={cn("pressable flex items-center gap-3 px-4 py-3", disabled && "opacity-60")} aria-label={`${c.name}${c.unread ? `, ${c.unread} non lu${c.unread > 1 ? "s" : ""}` : ""}`}>
          <AvatarMosaic photoKey={c.photo_key} people={c.type === "group" ? c.avatars : c.avatars.slice(0, 1)} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate text-[15px] text-text-1", c.unread > 0 && "font-semibold")}>{c.name}</span>
              <span className={cn("shrink-0 text-[12px] tabular-nums", c.unread > 0 ? "text-red-text" : "text-text-3")}>{shortTime(c.last_message?.created_at ?? c.last_message_at)}</span>
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-2">
              <span className={cn("truncate text-[13px]", c.unread > 0 ? "text-text-1" : "text-text-2")}>
                {c.mentioned && <span className="text-red-text">@ </span>}
                {preview}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {muted && <BellOff size={14} strokeWidth={1.75} className="text-text-3" aria-label="Silence" />}
                {c.pinned && <Pin size={14} strokeWidth={1.75} className="text-text-3" aria-label="Épinglée" />}
                {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1.5 text-[11px] font-semibold text-white">{c.unread > 99 ? "99+" : c.unread}</span>}
              </span>
            </span>
          </span>
        </Link>
      </motion.div>
    </li>
  );
}
