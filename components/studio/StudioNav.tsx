"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/studio", label: "Tableau de bord", exact: true },
  { href: "/studio/posts", label: "Publications" },
  { href: "/studio/stories", label: "Stories" },
  { href: "/studio/agenda", label: "Agenda" },
  { href: "/studio/moderation", label: "Modération" },
  { href: "/studio/retours", label: "Retours" },
  { href: "/studio/utilisateurs", label: "Utilisateurs" },
  { href: "/studio/parametres", label: "Paramètres" },
  ...(process.env.NODE_ENV === "production" ? [] : [{ href: "/studio/dev-ui", label: "Composants" }]),
];

export function StudioNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  if (compact) {
    return (
      <label className="relative flex items-center">
        <select
          aria-label="Navigation du studio"
          value={NAV.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)))?.href ?? "/studio"}
          onChange={(e) => router.push(e.target.value)}
          className="h-9 appearance-none rounded-[10px] bg-bg-2 pl-3 pr-8 text-[15px] font-medium text-text-1"
        >
          {NAV.map((n) => (
            <option key={n.href} value={n.href}>
              {n.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 text-text-3" />
      </label>
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
