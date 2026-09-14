"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bookmark, LayoutGrid, Newspaper, SquarePen, User } from "lucide-react";
import { useRole } from "./RoleContext";
import { NAV_ITEMS } from "@/lib/config";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/cn";

const ICONS = { feed: Newspaper, gallery: LayoutGrid, bookmark: Bookmark, user: User, studio: SquarePen } as const;

/**
 * Barre basse en verre : 4 entrées (+ « Studio » pour les éditeurs), icône 20 px + libellé 11 px, entrée active en
 * --text-1 sans fond ni pastille. Se masque au scroll vers le bas, revient au scroll
 * vers le haut.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const reduced = useReducedMotion();
  const { canEdit } = useRole();
  const items: { href: string; label: string; icon: keyof typeof ICONS }[] = canEdit ? [...NAV_ITEMS, { href: "/studio", label: "Studio", icon: "studio" }] : [...NAV_ITEMS];

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last;
        if (y < 16) setHidden(false);
        else if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      aria-label="Navigation principale"
      animate={{ y: hidden && !reduced ? "110%" : 0 }}
      transition={SPRING}
      className="glass fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className={cn("mx-auto grid max-w-[680px]", canEdit ? "grid-cols-5" : "grid-cols-4")}>
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable flex h-[52px] flex-col items-center justify-center gap-1 text-[11px] font-medium",
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
    </motion.nav>
  );
}
