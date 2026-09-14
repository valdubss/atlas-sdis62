import { PostSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément pendant la navigation entre les onglets. */
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="pb-2 pt-1">
        <Skeleton className="h-9 w-44" />
      </div>
      <PostSkeleton />
      <PostSkeleton />
    </div>
  );
}
