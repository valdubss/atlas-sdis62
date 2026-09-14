import type { Metadata } from "next";
import { fetchFeed } from "@/lib/feed/queries";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { InfiniteFeed } from "@/components/feed/InfiniteFeed";
import { SectionTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Favoris" };
export const dynamic = "force-dynamic";

export default async function FavorisPage() {
  const params = { bookmarked: true };
  const [current, posts] = await Promise.all([getCurrentUser(), fetchFeed(params)]);

  return (
    <div className="space-y-4">
      <SectionTitle className="px-4 sm:px-0">Favoris</SectionTitle>
      <InfiniteFeed
        initial={posts}
        params={params}
        canModerate={isEditorRole(current?.profile.role)}
        emptyTitle="Aucun favori"
        emptyDescription="Touchez l'icône marque-page d'une publication pour la retrouver ici."
      />
    </div>
  );
}
