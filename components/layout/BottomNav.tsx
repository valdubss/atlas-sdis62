"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookUser, Flame, MessageCircle, Newspaper, User } from "lucide-react";
import { NAV_ITEMS } from "@/lib/config";
import { getMessagingUnread } from "@/app/(app)/messages/actions";
import { useRole } from "./RoleContext";
import { cn } from "@/lib/cn";

const ICONS = { feed: Newspaper, center: Flame, directory: BookUser, user: User, messages: MessageCircle } as const;

/**
 * Barre basse flottante en verre : 4 entrées (le Studio se crée depuis le « + »
 * de la barre haute), icône 22 px + libellé 11 px, entrée active en --text-1.
 * Pour les ayants droit de la messagerie (éditeurs, référents, invités),
 * « Messages » remplace « Annuaire », qui reste accessible via la loupe et le profil.
 * Toujours visible, décollée des bords et de la zone de sécurité (façon Instagram).
 */
export function BottomNav() {
  const pathname = usePathname();
  const { canMessage, messagesUnread: initialUnread } = useRole();
  // Onglet actif dès le toucher, avant la réponse du serveur
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  // Non-lus de la messagerie : rafraîchis à chaque navigation, au retour sur l'app et toutes les 45 s
  useEffect(() => {
    if (!canMessage) return;
    let alive = true;
    const refresh = () => getMessagingUnread().then((n) => alive && setUnread(n)).catch(() => {});
    refresh();
    const t = setInterval(refresh, 45_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canMessage, pathname]);

  const items: { href: string; label: string; icon: keyof typeof ICONS }[] = NAV_ITEMS.map((it) => (canMessage && it.href === "/annuaire" ? { href: "/messages", label: "Messages", icon: "messages" } : it));

  // Clavier ouvert (champ de saisie actif ou fenêtre visuelle réduite) : la barre se cache
  // au lieu de remonter au-dessus du clavier.
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const check = () => {
      const el = document.activeElement as HTMLElement | null;
      const typing = Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) && !["checkbox", "radio", "file", "range", "date", "datetime-local"].includes((el as HTMLInputElement).type));
      const shrunk = vv ? window.innerHeight - vv.height > 140 : false;
      setKeyboard(typing && (shrunk || "ontouchstart" in window));
    };
    check();
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", () => setTimeout(check, 50));
    vv?.addEventListener("resize", check);
    return () => {
      document.removeEventListener("focusin", check);
      vv?.removeEventListener("resize", check);
    };
  }, []);

  // Écran de conversation : plein écran avec son composeur, sans barre basse
  if (/^\/messages\/[^/]+$/.test(pathname) || keyboard) return null;

  return (
    <nav aria-label="Navigation principale" className="glass-float fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 mx-auto max-w-[560px] rounded-[28px]">
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const current = pendingHref ?? pathname;
          const active = item.href === "/" ? current === "/" : item.href === "/centre" ? current.startsWith("/centre") || current.startsWith("/service") : current.startsWith(item.href);
          const Icon = ICONS[item.icon];
          const badge = item.href === "/messages" && unread > 0 ? unread : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setPendingHref(item.href)}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${item.label}, ${badge} non lu${badge > 1 ? "s" : ""}` : undefined}
                className={cn("pressable relative flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-text-1" : "text-text-2")}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                  {badge > 0 && <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] font-semibold text-white">{badge > 99 ? "99+" : badge}</span>}
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
