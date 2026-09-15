import { Suspense } from "react";
import { FEED_PAGE_SIZE, fetchCategories, fetchCenters, fetchFeed, fetchPinned, fetchStoryBar } from "@/lib/feed/queries";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { FEATURES } from "@/lib/config";
import { FeedHeader } from "@/components/feed/FeedHeader";
import { InfiniteFeed } from "@/components/feed/InfiniteFeed";
import { PullToRefresh } from "@/components/feed/PullToRefresh";
import { FeedCache } from "@/components/feed/FeedCache";
import { FlashBanner } from "@/components/feed/FlashBanner";
import { fetchActiveFlashes } from "@/lib/flash/queries";
import { fetchUnreadCount } from "@/lib/notifications/queries";
import { PostCard } from "@/components/feed/PostCard";
import { StoryBar } from "@/components/stories/StoryBar";
import { AgendaChip } from "@/components/feed/AgendaChip";
import { fetchNextEvent } from "@/lib/agenda/queries";

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

  const [current, categories, centers, pinned, posts, storyBar, flashes, unread, nextEvent] = await Promise.all([
    getCurrentUser(),
    FEATURES.categories ? fetchCategories() : Promise.resolve([]),
    FEATURES.centers ? fetchCenters() : Promise.resolve([]),
    filtered ? Promise.resolve([]) : fetchPinned(),
    fetchFeed(params),
    filtered ? Promise.resolve({ series: [], highlights: [] }) : fetchStoryBar(),
    filtered ? Promise.resolve([]) : fetchActiveFlashes(),
    fetchUnreadCount(),
    filtered ? Promise.resolve(null) : fetchNextEvent(),
  ]);
  const canModerate = isEditorRole(current?.profile.role);
  const pinnedIds = new Set(pinned.map((p) => p.id));

  return (
    <div className="space-y-3">
      <Suspense>
        <FeedHeader categories={categories} centers={centers} showCategories={FEATURES.categories} showCenters={FEATURES.centers} unread={unread} />
      </Suspense>

      {sp.erreur === "acces-studio" && (
        <p role="alert" className="rounded-[16px] bg-bg-1 px-4 py-3 text-[15px] text-text-2">
          Le studio est réservé au service communication.
        </p>
      )}

      {!filtered && <FeedCache posts={[...pinned, ...posts.filter((p) => !pinnedIds.has(p.id))]} />}
      <PullToRefresh>
        <div className="space-y-3">
          <FlashBanner flashes={flashes} />
          <StoryBar bar={storyBar} canEdit={canModerate} />
          {!filtered && <AgendaChip next={nextEvent} />}

          {pinned.map((p) => (
            <PostCard key={p.id} post={p} canModerate={canModerate} />
          ))}

          <InfiniteFeed
            initial={posts.filter((p) => !pinnedIds.has(p.id))}
            hasMore={posts.length >= FEED_PAGE_SIZE}
            params={params}
            canModerate={canModerate}
            emptyTitle={filtered ? "Aucun résultat" : "Aucune actualité pour le moment"}
            emptyDescription={filtered ? "Essayez un autre mot ou retirez un filtre." : "Les publications du service communication apparaîtront ici."}
          />
        </div>
      </PullToRefresh>
    </div>
  );
}
