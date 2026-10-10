"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { TopBar } from "./TopBar";

/**
 * Barre haute d'une page de détail : retour à gauche, titre centré, toujours en verre.
 * « Retour » revient à la page précédente de l'app (notification, favoris, annuaire…)
 * quand il y en a une ; sinon vers `href`.
 */
export function BackBar({ title, href = "/" }: { title: string; href?: string }) {
  const router = useRouter();
  function back(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof window === "undefined") return;
    const sameOrigin = document.referrer.startsWith(window.location.origin);
    if (window.history.length > 1 && sameOrigin) {
      e.preventDefault();
      router.back();
    }
  }
  return (
    <TopBar
      title={title}
      leading={
        <Link href={href} onClick={back} className="pressable -ml-2 flex h-12 items-center gap-0.5 pr-2 text-[15px] font-medium text-text-2 hover:text-text-1" aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={1.75} />
          Retour
        </Link>
      }
    />
  );
}
