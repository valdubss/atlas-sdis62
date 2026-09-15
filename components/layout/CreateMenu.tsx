"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarPlus, ChevronRight, Images, LayoutDashboard, Plus, Siren, Video, Zap } from "lucide-react";
import { useRole } from "./RoleContext";
import { Sheet } from "@/components/ui/Sheet";

const ITEMS = [
  { href: "/studio/posts/new?type=photo", label: "Publication photos", hint: "Jusqu'à 30 photos", icon: Images },
  { href: "/studio/posts/new?type=video", label: "Vidéo", hint: "Jusqu'à 5 min, qualités automatiques", icon: Video },
  { href: "/studio/stories/new", label: "Story", hint: "Photo ou vidéo de 30 s, 24 h", icon: Zap },
  { href: "/studio/posts/new?type=poll", label: "Sondage", hint: "Une question, jusqu'à 4 réponses", icon: BarChart3 },
  { href: "/studio/agenda/new", label: "Événement", hint: "Dans l'agenda des agents", icon: CalendarPlus },
  { href: "/studio/flash", label: "Flash", hint: "Message prioritaire, push à tous", icon: Siren },
];

/**
 * Bouton « + » de la barre haute (éditeurs) : créer une publication, une story,
 * un sondage, un événement, un flash, ou ouvrir le Studio. Libère la barre basse.
 */
export function CreateMenu() {
  const { canEdit } = useRole();
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Créer" aria-haspopup="dialog" className="pressable flex h-11 w-11 items-center justify-center text-text-2 hover:text-text-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] ring-1 ring-current">
          <Plus size={18} strokeWidth={2} />
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Créer">
        <ul className="px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
          {ITEMS.map((it) => (
            <li key={it.href}>
              <Link href={it.href} onClick={() => setOpen(false)} className="pressable flex min-h-14 items-center gap-3 rounded-[12px] px-3 py-2 hover:bg-bg-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-2 text-text-1">
                  <it.icon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-text-1">{it.label}</span>
                  <span className="block truncate text-[13px] text-text-3">{it.hint}</span>
                </span>
              </Link>
            </li>
          ))}
          <li className="mt-2 border-t border-line pt-2">
            <Link href="/studio" onClick={() => setOpen(false)} className="pressable flex min-h-14 items-center gap-3 rounded-[12px] px-3 py-2 hover:bg-bg-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-2 text-text-1">
                <LayoutDashboard size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-medium text-text-1">Ouvrir le Studio</span>
              <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </Sheet>
    </>
  );
}
