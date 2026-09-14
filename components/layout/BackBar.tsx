"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useRole } from "./RoleContext";
import { TopBar } from "./TopBar";

/** Barre haute d'une page de détail : retour à gauche, titre centré, toujours en verre. */
export function BackBar({ title, href = "/" }: { title: string; href?: string }) {
  const { canEdit } = useRole();
  return (
    <>
      <TopBar title={title} showStudio={canEdit} />
      <Link
        href={href}
        className="pressable fixed left-3 top-[env(safe-area-inset-top)] z-40 flex h-12 items-center gap-0.5 pr-2 text-[15px] font-medium text-text-2 hover:text-text-1"
        aria-label="Retour"
      >
        <ChevronLeft size={22} strokeWidth={1.75} />
        Retour
      </Link>
    </>
  );
}
