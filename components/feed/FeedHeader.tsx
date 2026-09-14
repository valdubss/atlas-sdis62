"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FeedFilters } from "./FeedFilters";

type Ref = { id: string; name: string; slug: string };

/** Grand titre « Actualités » + loupe ; la barre de filtres n'apparaît qu'à la demande. */
export function FeedHeader(props: { categories: Ref[]; centers: Ref[]; showCategories: boolean; showCenters: boolean }) {
  const sp = useSearchParams();
  const hasFilter = Boolean(sp.get("q") || sp.get("categorie") || sp.get("centre") || sp.get("tag"));
  const [open, setOpen] = useState(hasFilter);
  const showFilters = open || hasFilter || props.showCategories;

  return (
    <>
      <PageHeader
        title="Actualités"
        right={
          <button
            type="button"
            aria-label="Rechercher"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center text-text-2 hover:text-text-1"
          >
            <Search size={22} strokeWidth={1.75} />
          </button>
        }
      />
      {showFilters && (
        <div className="pb-1">
          <FeedFilters {...props} forceSearch={open} onCloseSearch={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
