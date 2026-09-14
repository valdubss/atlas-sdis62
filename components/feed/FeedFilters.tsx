"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";

type Ref = { id: string; name: string; slug: string };

/**
 * Filtres du fil : puces de catégories (défilement horizontal), recherche,
 * centre. Tout passe par l'URL (?categorie=&centre=&q=) : partageable, SSR.
 */
export function FeedFilters({
  categories,
  centers,
  showCategories = true,
  showCenters = true,
}: {
  categories: Ref[];
  centers: Ref[];
  showCategories?: boolean;
  showCenters?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [searchOpen, setSearchOpen] = useState(Boolean(sp.get("q")));
  const [q, setQ] = useState(sp.get("q") ?? "");

  const category = sp.get("categorie") ?? "";
  const center = sp.get("centre") ?? "";
  const tag = sp.get("tag") ?? "";

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startTransition(() => router.push(`/?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("space-y-2 bg-bg", pending && "opacity-70")}>
      <div className="flex items-center gap-2">
        {showCategories ? (
          <div className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={!category} onClick={() => push({ categorie: "" })}>
              Tout
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={category === c.slug} onClick={() => push({ categorie: category === c.slug ? "" : c.slug })}>
                {c.name}
              </Chip>
            ))}
          </div>
        ) : (
          <h1 className="flex-1 font-display text-2xl font-bold uppercase leading-none text-navy">Fil d&apos;actualités</h1>
        )}
        <button
          type="button"
          aria-label="Rechercher"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
          className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", searchOpen ? "bg-navy text-white" : "bg-surface text-navy shadow-soft")}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {searchOpen && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: q.trim() });
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une publication…"
            aria-label="Rechercher"
            autoFocus
            className="h-10 flex-1 rounded-full border border-line bg-surface px-4 text-base text-body focus:border-navy focus:outline-none"
          />
          {showCenters && (
          <select
            aria-label="Filtrer par centre"
            value={center}
            onChange={(e) => push({ centre: e.target.value })}
            className="h-10 max-w-[40%] rounded-full border border-line bg-surface px-3 text-sm text-body"
          >
            <option value="">Tous les centres</option>
            {centers.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          )}
        </form>
      )}

      {(sp.get("q") || center || tag) && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {sp.get("q") && <FilterPill onClear={() => { setQ(""); push({ q: "" }); }}>« {sp.get("q")} »</FilterPill>}
          {center && <FilterPill onClear={() => push({ centre: "" })}>{centers.find((c) => c.slug === center)?.name ?? center}</FilterPill>}
          {tag && <FilterPill onClear={() => push({ tag: "" })}>#{tag}</FilterPill>}
        </p>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors",
        active ? "bg-navy text-white" : "bg-surface text-body shadow-soft hover:text-navy",
      )}
    >
      {children}
    </button>
  );
}

function FilterPill({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 font-semibold text-navy">
      {children}
      <button type="button" onClick={onClear} aria-label="Retirer ce filtre" className="rounded-full p-1 hover:bg-line">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
