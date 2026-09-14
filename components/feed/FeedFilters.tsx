"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type Ref = { id: string; name: string; slug: string };

/**
 * Recherche et filtres du fil. Tout passe par l'URL (?q=&categorie=&centre=).
 * Champ 44 px --bg-1 ; puces --bg-1, active en --red-soft.
 */
export function FeedFilters({
  categories,
  centers,
  showCategories = true,
  showCenters = true,
  forceSearch = false,
  onCloseSearch,
}: {
  categories: Ref[];
  centers: Ref[];
  showCategories?: boolean;
  showCenters?: boolean;
  forceSearch?: boolean;
  onCloseSearch?: () => void;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const category = sp.get("categorie") ?? "";
  const center = sp.get("centre") ?? "";
  const tag = sp.get("tag") ?? "";
  const activeQ = sp.get("q") ?? "";
  const searchOpen = forceSearch || Boolean(activeQ);

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startTransition(() => router.push(`/?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("space-y-3", pending && "opacity-70")}>
      {searchOpen && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: q.trim() });
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher"
            aria-label="Rechercher"
            autoFocus
            className="h-11 flex-1 rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
          />
          <button
            type="button"
            onClick={() => {
              setQ("");
              if (activeQ) push({ q: "" });
              onCloseSearch?.();
            }}
            className="h-11 px-1 text-[15px] font-medium text-text-2 hover:text-text-1"
          >
            Annuler
          </button>
        </form>
      )}

      {searchOpen && showCenters && (
        <select
          aria-label="Filtrer par centre"
          value={center}
          onChange={(e) => push({ centre: e.target.value })}
          className="h-11 w-full appearance-none rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1"
        >
          <option value="">Tous les centres</option>
          {centers.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {showCategories && (
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:-mx-8 sm:px-8">
          <Chip active={!category} onClick={() => push({ categorie: "" })}>
            Tout
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={category === c.slug} onClick={() => push({ categorie: category === c.slug ? "" : c.slug })}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {(activeQ || center || tag) && (
        <div className="flex flex-wrap items-center gap-2">
          {activeQ && (
            <FilterPill
              onClear={() => {
                setQ("");
                push({ q: "" });
              }}
            >
              « {activeQ} »
            </FilterPill>
          )}
          {center && <FilterPill onClear={() => push({ centre: "" })}>{centers.find((c) => c.slug === center)?.name ?? center}</FilterPill>}
          {tag && <FilterPill onClear={() => push({ tag: "" })}>#{tag}</FilterPill>}
        </div>
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
      className={cn("h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-medium", active ? "bg-red-soft text-text-1" : "bg-bg-1 text-text-2")}
    >
      {children}
    </button>
  );
}

function FilterPill({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-bg-1 pl-3 pr-1 text-[13px] font-medium text-text-1">
      {children}
      <button type="button" onClick={onClear} aria-label="Retirer ce filtre" className="flex h-6 w-6 items-center justify-center rounded-full text-text-2 hover:text-text-1">
        <X size={14} strokeWidth={2} />
      </button>
    </span>
  );
}
