import { Skeleton } from "@/components/ui/Skeleton";

/** Squelette de la messagerie : champ de recherche, filtres, conversations. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="pb-1 pt-1">
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-11 w-full rounded-[12px]" />
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="hairline overflow-hidden rounded-[16px] bg-bg-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
