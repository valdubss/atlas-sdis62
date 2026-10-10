"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getUnreadCount } from "@/app/(app)/notifications/actions";

/**
 * Cloche de la barre haute, sur tous les écrans : point rouge avec le nombre de
 * non-lues. Lu une fois au montage (sans dépendre de la route : aucune requête
 * à chaque navigation), puis au retour sur l'app et toutes les deux minutes ;
 * badge de l'application (icône) sur les appareils qui le permettent.
 */
export function BellButton({ unread: initial = 0 }: { unread?: number }) {
  const [unread, setUnread] = useState(initial);

  useEffect(() => {
    let alive = true;
    const refresh = () => getUnreadCount().then((n) => alive && setUnread(n)).catch(() => {});
    const first = setTimeout(refresh, 1500);
    const timer = setInterval(refresh, 120_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
      className="pressable relative flex h-11 w-11 items-center justify-center text-text-2 hover:text-text-1"
    >
      <Bell size={22} strokeWidth={1.75} aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-fill px-1 text-[11px] font-semibold tabular-nums text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
