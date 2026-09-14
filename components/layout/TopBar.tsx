"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/Logo";

/**
 * Barre haute en verre. Transparente au repos ; quand le grand titre de la page
 * sort de l'écran, la barre se teinte et le titre réduit apparaît, centré
 * (largeTitleDisplayMode). Sans grand titre sur la page, elle est toujours teintée.
 */
export function TopBar({ title, showStudio, right }: { title: string; showStudio: boolean; right?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const target = document.getElementById("large-title");
    if (!target) {
      setCollapsed(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: "-48px 0px 0px 0px" });
    io.observe(target);
    return () => io.disconnect();
  }, [title]);

  return (
    <header
      className={cn("fixed inset-x-0 top-0 z-30 transition-colors duration-200", collapsed ? "glass" : "border-t border-transparent")}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="relative mx-auto flex h-12 max-w-[680px] items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Accueil" className="pressable flex items-center">
          <Logo height={22} />
        </Link>
        <span
          className={cn(
            "pointer-events-none absolute inset-x-16 truncate text-center text-[17px] font-semibold tracking-[-0.02em] text-text-1 transition-opacity duration-200",
            collapsed ? "opacity-100" : "opacity-0",
          )}
        >
          {title}
        </span>
        <div className="flex items-center gap-3">
          {right}
          {showStudio && (
            <Link href="/studio" className="pressable text-[15px] font-medium text-text-2 hover:text-text-1">
              Studio
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Grand titre 34/600 posé en haut du contenu ; observé par la TopBar. */
export function LargeTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div id="large-title" className="flex items-center justify-between gap-4 pb-2 pt-1">
      <h1 className="text-[34px] font-semibold tracking-[-0.02em] leading-[1.15] text-text-1">{children}</h1>
      {right}
    </div>
  );
}
