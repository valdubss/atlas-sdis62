"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookUser, Flame, Newspaper, User } from "lucide-react";
import { NAV_ITEMS } from "@/lib/config";
import { cn } from "@/lib/cn";

const ICONS = { feed: Newspaper, center: Flame, directory: BookUser, user: User } as const;

/**
 * Barre basse flottante en verre : 4 entrées pour tous (le Studio se crée depuis
 * le « + » de la barre haute), icône 22 px + libellé 11 px, entrée active en
 * --text-1 sans fond ni pastille.
 * Toujours visible, décollée des bords et de la zone de sécurité (façon Instagram).
 */
export function BottomNav() {
  const pathname = usePathname();
  // Onglet actif dès le toucher, avant la réponse du serveur
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);
  const items: { href: string; label: string; icon: keyof typeof ICONS }[] = [...NAV_ITEMS];

  return (
    <nav
      aria-label="Navigation principale"
      className="glass-float fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 mx-auto max-w-[560px] rounded-[28px]"
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const current = pendingHref ?? pathname;
          const active = item.href === "/" ? current === "/" : item.href === "/centre" ? current.startsWith("/centre") || current.startsWith("/service") : current.startsWith(item.href);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setPendingHref(item.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-text-1" : "text-text-2",
                )}
              >
                <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
