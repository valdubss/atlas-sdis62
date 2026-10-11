import { Skeleton } from "@/components/ui/Skeleton";

/** Squelette affiché instantanément pendant la navigation dans l'administration. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[16px]" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[16px]" />
    </div>
  );
}
