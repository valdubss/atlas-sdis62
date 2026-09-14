"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/studio", label: "Tableau de bord", exact: true },
  { href: "/studio/posts", label: "Publications" },
  { href: "/studio/stories", label: "Stories" },
  { href: "/studio/moderation", label: "Modération" },
  { href: "/studio/retours", label: "Retours" },
  { href: "/studio/utilisateurs", label: "Utilisateurs" },
  { href: "/studio/parametres", label: "Paramètres" },
  ...(process.env.NODE_ENV === "production" ? [] : [{ href: "/studio/dev-ui", label: "Composants" }]),
];

export function StudioNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  if (compact) {
    return (
      <select
        aria-label="Navigation du studio"
        value={NAV.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)))?.href ?? "/studio"}
        onChange={(e) => (window.location.href = e.target.value)}
        className="h-9 appearance-none rounded-[10px] bg-bg-2 px-3 text-[13px] text-text-1"
      >
        {NAV.map((n) => (
          <option key={n.href} value={n.href}>
            {n.label}
          </option>
        ))}
        <option value="/">Retour au fil</option>
      </select>
    );
  }

  return (
    <nav className="flex flex-col px-3 pt-2" aria-label="Navigation du studio">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "pressable flex h-10 items-center rounded-[10px] px-3 text-[15px]",
              active ? "bg-bg-2 font-medium text-text-1" : "text-text-2 hover:text-text-1",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <Link href="/" className="pressable mt-4 flex h-10 items-center gap-2 px-3 text-[15px] text-text-2 hover:text-text-1">
        <ArrowLeft size={18} strokeWidth={1.75} />
        Retour au fil
      </Link>
    </nav>
  );
}
