import { Skeleton } from "@/components/ui/Skeleton";

/** Squelette de l'annuaire : recherche, groupements et centres. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="pb-1 pt-1">
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-11 w-full rounded-[12px]" />
      {Array.from({ length: 3 }).map((_, g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-[10px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
