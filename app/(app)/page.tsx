import { Suspense } from "react";
import { fetchCategories, fetchCenters, fetchFeed, fetchPinned } from "@/lib/feed/queries";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { FeedFilters } from "@/components/feed/FeedFilters";
import { InfiniteFeed } from "@/components/feed/InfiniteFeed";
import { PostCard } from "@/components/feed/PostCard";
import { EcgDivider } from "@/components/brand/Ecg";
import { FEATURES } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; categorie?: string; centre?: string; q?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const params = {
    category: sp.categorie || null,
    center: sp.centre || null,
    q: sp.q || null,
    tag: sp.tag || null,
  };
  const filtered = Boolean(params.category || params.center || params.q || params.tag);

  const [current, categories, centers, pinned, posts] = await Promise.all([
    getCurrentUser(),
    fetchCategories(),
    fetchCenters(),
    filtered ? Promise.resolve([]) : fetchPinned(),
    fetchFeed(params),
  ]);
  const canModerate = isEditorRole(current?.profile.role);
  const pinnedIds = new Set(pinned.map((p) => p.id));

  return (
    <div className="space-y-3 sm:space-y-4">
      {sp.erreur === "acces-studio" && (
        <p role="alert" className="mx-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-body sm:mx-0">
          Le studio est réservé au service communication.
        </p>
      )}

      <div className="px-4 sm:px-0">
        <Suspense>
          <FeedFilters categories={categories} centers={centers} showCategories={FEATURES.categories} showCenters={FEATURES.centers} />
        </Suspense>
      </div>

      {/* Lot d : bandeau de stories */}

      {pinned.length > 0 && (
        <section aria-label="Publications épinglées" className="space-y-0 sm:space-y-4">
          {pinned.map((p) => (
            <PostCard key={p.id} post={p} canModerate={canModerate} />
          ))}
          <EcgDivider className="px-4 sm:px-0" />
        </section>
      )}

      <InfiniteFeed
        initial={posts.filter((p) => !pinnedIds.has(p.id))}
        params={params}
        canModerate={canModerate}
        emptyTitle={filtered ? "Aucun résultat" : "Aucune actualité pour le moment"}
        emptyDescription={
          filtered
            ? "Essayez un autre mot-clé ou retirez un filtre."
            : "Les publications du service communication apparaîtront ici."
        }
      />
    </div>
  );
}
