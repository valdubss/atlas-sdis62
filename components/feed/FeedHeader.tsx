"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { FeedFilters } from "./FeedFilters";

type Ref = { id: string; name: string; slug: string };

/** Barre haute du fil (logo + loupe), sans grand titre ; les filtres n'apparaissent qu'à la demande. */
export function FeedHeader(props: { categories: Ref[]; centers: Ref[]; showCategories: boolean; showCenters: boolean; unread?: number }) {
  const sp = useSearchParams();
  const hasFilter = Boolean(sp.get("q") || sp.get("categorie") || sp.get("centre") || sp.get("tag"));
  const [open, setOpen] = useState(hasFilter);
  const showFilters = open || hasFilter || props.showCategories;

  return (
    <>
      <TopBar
        right={
          <>
            <button
              type="button"
              aria-label="Rechercher"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="-mr-2 flex h-11 w-11 items-center justify-center text-text-2 hover:text-text-1"
            >
              <Search size={22} strokeWidth={1.75} />
            </button>
          </>
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
