"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

/** Cloche de la barre haute : pastille rouge avec le nombre de non-lues. */
export function BellButton({ unread }: { unread: number }) {
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
