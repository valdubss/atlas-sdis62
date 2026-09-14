import { Suspense } from "react";
import { fetchCategories, fetchCenters, fetchFeed, fetchPinned } from "@/lib/feed/queries";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { FEATURES } from "@/lib/config";
import { FeedHeader } from "@/components/feed/FeedHeader";
import { InfiniteFeed } from "@/components/feed/InfiniteFeed";
import { PostCard } from "@/components/feed/PostCard";

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
    FEATURES.categories ? fetchCategories() : Promise.resolve([]),
    FEATURES.centers ? fetchCenters() : Promise.resolve([]),
    filtered ? Promise.resolve([]) : fetchPinned(),
    fetchFeed(params),
  ]);
  const canModerate = isEditorRole(current?.profile.role);
  const pinnedIds = new Set(pinned.map((p) => p.id));

  return (
    <div className="space-y-3">
      <Suspense>
        <FeedHeader categories={categories} centers={centers} showCategories={FEATURES.categories} showCenters={FEATURES.centers} />
      </Suspense>

      {sp.erreur === "acces-studio" && (
        <p role="alert" className="rounded-[16px] bg-bg-1 px-4 py-3 text-[15px] text-text-2">
          Le studio est réservé au service communication.
        </p>
      )}

      {/* Lot d : anneaux de stories */}

      {pinned.map((p) => (
        <PostCard key={p.id} post={p} canModerate={canModerate} />
      ))}

      <InfiniteFeed
        initial={posts.filter((p) => !pinnedIds.has(p.id))}
        params={params}
        canModerate={canModerate}
        emptyTitle={filtered ? "Aucun résultat" : "Aucune actualité pour le moment"}
        emptyDescription={filtered ? "Essayez un autre mot ou retirez un filtre." : "Les publications du service communication apparaîtront ici."}
      />
    </div>
  );
}
