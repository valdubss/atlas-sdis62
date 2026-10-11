import { PostSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Squelette d'une page de centre : en-tête, onglets suivis, fiche, semaine, fil. */
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="pb-1 pt-1">
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-[28px]" />
      <Skeleton className="h-36 w-full rounded-[16px]" />
      <Skeleton className="h-16 w-full rounded-[16px]" />
      <PostSkeleton />
    </div>
  );
}
