import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { fetchCenterBySlug, fetchCenterPhotos, fetchCenterWeek, fetchFollows, fetchNewcomers, isReferentOf } from "@/lib/centres/public";
import { FEED_PAGE_SIZE, fetchFeed } from "@/lib/feed/queries";
import { TopBar } from "@/components/layout/TopBar";
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
import { CenterTeam } from "@/components/centre/CenterTeam";
import { fetchTeam } from "@/lib/centres/directory";
import { MembershipRequests } from "@/components/centre/MembershipRequests";
import { CenterContactsAdmin } from "@/components/centre/CenterContactsAdmin";
import { fetchCenterRequests } from "@/lib/membership/request";
import { NOTE_ROLE_LABELS, type NoteAuthorRole } from "@/lib/centres/notes";
import { fetchCenterNotes } from "@/lib/centres/notes-server";
import { CenterFeeds } from "@/components/centre/CenterNotes";

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
export default async function CenterPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ onglet?: string }> }) {
  const [{ slug }, { onglet }, current] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const center = await fetchCenterBySlug(slug);
  if (!center) notFound();
  const { profile } = current;
  const supabase = await createClient();

  const [week, newcomers, photos, posts, follows, referent, home, team, canManage, fallback, requests, notes, myRole] = await Promise.all([
    fetchCenterWeek(center.id),
    fetchNewcomers(center.id),
    fetchCenterPhotos(center.id),
    fetchFeed({ centerId: center.id }),
    fetchFollows(profile.id),
    isReferentOf(profile.id, center.id),
    profile.center_id ? supabase.from("centers").select("id, slug, name, type, city, grouping_id").eq("id", profile.center_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    fetchTeam("center", center.id),
    supabase.rpc("can_manage_center", { p_center: center.id }).then((r) => Boolean(r.data)),
    supabase.from("app_settings").select("value").eq("key", "membership_fallback_email").maybeSingle().then((r) => (typeof r.data?.value === "string" ? (r.data.value as string) : null)),
    // Demandes en attente : chargées en même temps que le reste (vides si l'agent n'est pas responsable)
    supabase.rpc("can_manage_center", { p_center: center.id }).then((r) => (r.data ? fetchCenterRequests(center.id) : [])),
    // Notes de service : vides si l'agent n'est ni membre ni responsable (RLS)
    fetchCenterNotes(center.id),
    supabase.rpc("center_author_role", { p_center: center.id, p_profile: profile.id }).then((r) => (r.data ?? null) as NoteAuthorRole),
  ]);
  const isAdmin = profile.role === "admin";
  void supabase.rpc("record_page_view", { p_kind: "center", p_target: center.id }).then(() => undefined, () => undefined);

  const isHome = profile.center_id === center.id;
  const following = follows.some((f) => f.id === center.id);
  const canModerate = isEditorRole(profile.role);
  const canSeeNotes = isHome || canManage;
  const roleLabel = myRole && myRole !== "service_com" && canManage ? NOTE_ROLE_LABELS[myRole] : null;

  return (
    <div className="space-y-3">
      <TopBar title={center.name} leading={!isHome ? <Link href="/centre" className="pressable -ml-2 flex h-12 items-center pr-2 text-[15px] font-medium text-text-2 hover:text-text-1">Mon centre</Link> : undefined} />
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
          {roleLabel && (
            <p className="rounded-[12px] bg-bg-1 px-4 py-2.5 text-[13px] text-text-2">
              <span className="font-semibold text-text-1">{roleLabel}</span> · vous publiez les notes de service du centre, visibles de ses seuls membres.
            </p>
          )}
          {isAdmin && <CenterContactsAdmin centerId={center.id} contacts={{ chief_name: center.chief_name, chief_email: center.chief_email, com_name: center.com_name, com_email: center.com_email }} fallbackEmail={fallback} />}
          {canManage && <MembershipRequests requests={requests} targetName={center.name} />}
          <CenterWeek events={week} />
          <CenterNewcomers people={newcomers} />
          <CenterTeam people={team} />
          <CenterFeeds centerId={center.id} centerName={center.name} notes={notes} canSeeNotes={canSeeNotes} canManage={canManage} initialTab={onglet === "notes" ? "notes" : "actus"}>
            <InfiniteFeed
              initial={posts}
              hasMore={posts.length >= FEED_PAGE_SIZE}
              params={{ centerId: center.id }}
              canModerate={canModerate}
              emptyTitle="Pas encore d'actu"
              emptyDescription={referent ? "Proposez la première : elle sera publiée ici après validation." : "Les actus proposées par les référents du centre apparaîtront ici."}
            />
          </CenterFeeds>
          <CenterPhotos photos={photos} />
        </div>
      </PullToRefresh>
      {(referent || (canManage && !canModerate)) && <ProposeFab centerId={center.id} centerName={center.name} manager={canManage} />}
    </div>
  );
}
