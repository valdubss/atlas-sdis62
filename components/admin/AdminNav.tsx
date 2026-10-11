"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, BookOpen, Building2, ChevronDown, Inbox, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Item = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean; exact?: boolean };

const NAV: Item[] = [
  { href: "/admin", label: "Tableau de bord", icon: BarChart3, adminOnly: true, exact: true },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, adminOnly: true },
  { href: "/admin/centres", label: "Centres et services", icon: Building2 },
  { href: "/admin/centres/demandes", label: "Rattachements", icon: Inbox, exact: true },
  { href: "/admin/journal", label: "Journal", icon: BookOpen },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
];

/**
 * Navigation de l'espace d'administration : liste latérale sur ordinateur,
 * sélecteur compact dans la barre haute sur téléphone.
 */
export function AdminNav({ compact = false, isAdmin, pendingRequests = 0 }: { compact?: boolean; isAdmin: boolean; pendingRequests?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.filter((n) => isAdmin || !n.adminOnly);
  const current = items.filter((n) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? items[0].href;

  if (compact) {
    return (
      <label className="relative flex items-center">
        <select aria-label="Navigation de l'administration" value={current} onChange={(e) => router.push(e.target.value)} className="h-9 appearance-none rounded-[10px] bg-bg-2 pl-3 pr-8 text-[15px] font-medium text-text-1">
          {items.map((n) => (
            <option key={n.href} value={n.href}>
              {n.label}
              {n.href === "/admin/centres/demandes" && pendingRequests > 0 ? ` (${pendingRequests})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 text-text-3" />
      </label>
    );
  }

  return (
    <nav className="flex flex-col px-3 pt-2" aria-label="Navigation de l'administration">
      {items.map((item) => {
        const active = item.href === current;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("pressable flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px]", active ? "bg-bg-2 font-medium text-text-1" : "text-text-2 hover:text-text-1")}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" className={active ? "text-text-1" : "text-text-3"} />
            <span className="flex-1">{item.label}</span>
            {item.href === "/admin/centres/demandes" && pendingRequests > 0 && (
              <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-fill px-1.5 text-[11px] font-semibold tabular-nums text-white">{pendingRequests}</span>
            )}
          </Link>
        );
      })}
      <Link href="/studio" className="pressable mt-4 flex h-10 items-center gap-2 px-3 text-[15px] text-text-2 hover:text-text-1">
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Studio
      </Link>
      <Link href="/" className="pressable flex h-10 items-center gap-2 px-3 text-[15px] text-text-2 hover:text-text-1">
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Retour au fil
      </Link>
    </nav>
  );
}
