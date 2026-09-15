import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { fetchCenterBySlug, fetchCenterPhotos, fetchCenterWeek, fetchFollows, fetchNewcomers, isReferentOf } from "@/lib/centres/public";
import { FEED_PAGE_SIZE, fetchFeed } from "@/lib/feed/queries";
import { TopBar } from "@/components/layout/TopBar";
import { BellButton } from "@/components/layout/BellButton";
import { fetchUnreadCount } from "@/lib/notifications/queries";
import { CenterHero } from "@/components/centre/CenterHero";
import { CenterIdentity } from "@/components/centre/CenterIdentity";
import { CenterWeek } from "@/components/centre/CenterWeek";
import { CenterNewcomers } from "@/components/centre/CenterNewcomers";
import { CenterPhotos } from "@/components/centre/CenterPhotos";
import { FollowTabs } from "@/components/centre/FollowTabs";
import { FollowButton } from "@/components/centre/FollowButton";
import { ProposeFab } from "@/components/centre/ProposeSheet";
import { InfiniteFeed } from "@/components/feed/InfiniteFeed";
import { PullToRefresh } from "@/components/feed/PullToRefresh";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const center = await fetchCenterBySlug(slug);
  return { title: center?.name ?? "Centre" };
}

/**
 * Page d'un centre : couverture, identité, semaine, nouveaux arrivants, fil
 * du centre, photos. Les contenus restent ici : ils n'entrent jamais dans le
 * fil départemental.
 */
export default async function CenterPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, current] = await Promise.all([params, getCurrentUser()]);
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const center = await fetchCenterBySlug(slug);
  if (!center) notFound();
  const { profile } = current;
  const supabase = await createClient();

  const [week, newcomers, photos, posts, follows, referent, unread, home] = await Promise.all([
    fetchCenterWeek(center.id),
    fetchNewcomers(center.id),
    fetchCenterPhotos(center.id),
    fetchFeed({ centerId: center.id }),
    fetchFollows(profile.id),
    isReferentOf(profile.id, center.id),
    fetchUnreadCount(),
    profile.center_id ? supabase.from("centers").select("id, slug, name, type, city, grouping_id").eq("id", profile.center_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  void supabase.rpc("record_page_view", { p_kind: "center", p_target: center.id }).then(() => undefined, () => undefined);

  const isHome = profile.center_id === center.id;
  const following = follows.some((f) => f.id === center.id);
  const canModerate = isEditorRole(profile.role);

  return (
    <div className="space-y-3">
      <TopBar title={center.name} right={<BellButton unread={unread} />} leading={!isHome ? <Link href="/centre" className="pressable -ml-2 flex h-12 items-center pr-2 text-[15px] font-medium text-text-2 hover:text-text-1">Mon centre</Link> : undefined} />
      <FollowTabs home={home ?? null} follows={follows} currentSlug={slug} />
      <PullToRefresh>
        <div className="space-y-3">
          <CenterHero center={center} />
          {!isHome && (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[13px] text-text-3">{following ? "Vous suivez ce centre." : "Suivez ce centre pour le retrouver dans vos onglets."}</p>
              <FollowButton centerId={center.id} following={following} />
            </div>
          )}
          <CenterIdentity center={center} />
          <CenterWeek events={week} />
          <CenterNewcomers people={newcomers} />
          <section className="space-y-2">
            <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Actus du centre</h2>
            <InfiniteFeed
              initial={posts}
              hasMore={posts.length >= FEED_PAGE_SIZE}
              params={{ centerId: center.id }}
              canModerate={canModerate}
              emptyTitle="Pas encore d'actu"
              emptyDescription={referent ? "Proposez la première : elle sera publiée ici après validation." : "Les actus proposées par les référents du centre apparaîtront ici."}
            />
          </section>
          <CenterPhotos photos={photos} />
        </div>
      </PullToRefresh>
      {referent && <ProposeFab centerId={center.id} centerName={center.name} />}
    </div>
  );
}
