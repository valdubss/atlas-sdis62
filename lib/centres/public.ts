import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Center, CenterType, Grouping, Service } from "@/lib/supabase/database.types";
import type { EventItem } from "@/lib/agenda/queries";
import type { FeedPost, MediaItem } from "@/lib/feed/types";
import type { PersonRef } from "./queries";

export type CenterSummary = { id: string; slug: string; name: string; type: CenterType; city: string | null; grouping_id: string | null };
export type ServiceSummary = { id: string; slug: string; name: string; short_description: string | null };
export type Directory = { groupings: Grouping[]; centers: CenterSummary[]; services: ServiceSummary[] };
export type CenterPublic = Center & { grouping: { id: string; name: string } | null; chief: PersonRef | null; referents: PersonRef[]; cover: MediaItem | null };
export type ServicePublic = Service & { grouping: { id: string; name: string } | null; manager: PersonRef | null };
export type Newcomer = { id: string; first_name: string; last_name: string; avatar_key: string | null; job_title: string | null; center_joined_at: string | null };
export type CenterPhoto = { media: MediaItem; post_id: string; post_slug: string };
export type MyProposal = {
  kind: "post" | "event";
  id: string;
  title: string | null;
  body: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  moderation_message: string | null;
  slug: string | null;
  starts_at: string | null;
  center: { name: string; slug: string } | null;
};

const PERSON = "id, first_name, last_name, avatar_key, job_title";
const MEDIA = "id, kind, variants, poster_key, width, height, alt, mime, original_key";
const EVENT = "id, title, description, location, starts_at, ends_at, all_day, status, created_at, post:posts!events_post_id_fkey(id, slug, title)";

/** Référentiel visible par les agents : groupements, centres et services actifs. */
export const fetchDirectory = cache(async (): Promise<Directory> => {
  const supabase = await createClient();
  const [{ data: groupings }, { data: centers }, { data: services }] = await Promise.all([
    supabase.from("groupings").select("*").order("sort_order").order("name"),
    supabase.from("centers").select("id, slug, name, type, city, grouping_id").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("services").select("id, slug, name, short_description").eq("is_active", true).order("sort_order").order("name"),
  ]);
  return { groupings: groupings ?? [], centers: (centers ?? []) as CenterSummary[], services: (services ?? []) as ServiceSummary[] };
});

export const fetchCenterBySlug = cache(async (slug: string): Promise<CenterPublic | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("centers")
    .select(`*, grouping:groupings!centers_grouping_id_fkey(id, name), chief:profiles!centers_chief_id_fkey(${PERSON}), cover:media!centers_cover_media_id_fkey(${MEDIA})`)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const { data: refs } = await supabase.from("center_referents").select(`profile:profiles!center_referents_profile_id_fkey(${PERSON})`).eq("center_id", data.id).eq("is_active", true).order("since");
  const row = data as unknown as Omit<CenterPublic, "referents" | "cover"> & { cover: MediaItem | null };
  return {
    ...row,
    cover: row.cover ? ({ ...row.cover, alt: row.cover.alt ?? "" } as MediaItem) : null,
    referents: ((refs ?? []) as unknown as { profile: PersonRef | null }[]).map((r) => r.profile).filter((p): p is PersonRef => Boolean(p)),
  };
});

export const fetchServiceBySlug = cache(async (slug: string): Promise<ServicePublic | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select(`*, grouping:groupings!services_grouping_id_fkey(id, name), manager:profiles!services_manager_id_fkey(${PERSON})`)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as ServicePublic | null) ?? null;
});

/** Événements du centre dans les 7 prochains jours (ou en cours). */
export async function fetchCenterWeek(centerId: string): Promise<EventItem[]> {
  const supabase = await createClient();
  const now = Date.now();
  const { data } = await supabase
    .from("events")
    .select(EVENT)
    .eq("center_id", centerId)
    .eq("status", "published")
    .is("deleted_at", null)
    .lte("starts_at", new Date(now + 7 * 86_400_000).toISOString())
    .or(`ends_at.gte.${new Date(now).toISOString()},and(ends_at.is.null,starts_at.gte.${new Date(now - 3 * 3600_000).toISOString()})`)
    .order("starts_at", { ascending: true })
    .limit(20);
  return (data ?? []) as unknown as EventItem[];
}

/** Agents arrivés depuis moins de 60 jours et ayant accepté d'être présentés. */
export async function fetchNewcomers(centerId: string): Promise<Newcomer[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_key, job_title, center_joined_at")
    .eq("center_id", centerId)
    .eq("present_me", true)
    .eq("is_active", true)
    .gte("center_joined_at", since)
    .order("center_joined_at", { ascending: false })
    .limit(12);
  return (data ?? []) as Newcomer[];
}

/** Dernières photos publiées sur la page du centre (grille). */
export async function fetchCenterPhotos(centerId: string, limit = 24): Promise<CenterPhoto[]> {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("id, slug")
    .eq("scope", "center")
    .eq("center_id", centerId)
    .eq("type", "photo")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(12);
  if (!posts?.length) return [];
  const slugs = new Map(posts.map((p) => [p.id, p.slug]));
  const { data: rows } = await supabase
    .from("post_media")
    .select(`post_id, position, media:media!post_media_media_id_fkey(${MEDIA}, status)`)
    .in(
      "post_id",
      posts.map((p) => p.id),
    )
    .order("position");
  const order = new Map(posts.map((p, i) => [p.id, i]));
  return ((rows ?? []) as unknown as { post_id: string; position: number; media: (MediaItem & { status: string }) | null }[])
    .filter((r) => r.media && r.media.kind === "image" && r.media.status === "ready")
    .sort((a, b) => (order.get(a.post_id) ?? 0) - (order.get(b.post_id) ?? 0) || a.position - b.position)
    .slice(0, limit)
    .map((r) => ({ media: { ...(r.media as MediaItem), alt: r.media!.alt ?? "" }, post_id: r.post_id, post_slug: slugs.get(r.post_id) ?? "" }));
}

/** Centres suivis par l'agent (3 au plus). */
export async function fetchFollows(profileId: string): Promise<CenterSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("center_follows").select("created_at, center:centers!center_follows_center_id_fkey(id, slug, name, type, city, grouping_id, is_active)").eq("profile_id", profileId).order("created_at");
  return ((data ?? []) as unknown as { center: (CenterSummary & { is_active: boolean }) | null }[]).map((r) => r.center).filter((c): c is CenterSummary & { is_active: boolean } => Boolean(c && c.is_active));
}

export async function isReferentOf(profileId: string, centerId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase.from("center_referents").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("center_id", centerId).eq("is_active", true);
  return (count ?? 0) > 0;
}

/** Centres dont l'agent est référent (pour le menu « Proposer »). */
export async function fetchMyReferentCenters(profileId: string): Promise<CenterSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("center_referents").select("center:centers!center_referents_center_id_fkey(id, slug, name, type, city, grouping_id)").eq("profile_id", profileId).eq("is_active", true);
  return ((data ?? []) as unknown as { center: CenterSummary | null }[]).map((r) => r.center).filter((c): c is CenterSummary => Boolean(c));
}

/** Propositions de l'agent (posts et événements), toutes situations confondues. */
export async function fetchMyProposals(profileId: string): Promise<MyProposal[]> {
  const supabase = await createClient();
  const [{ data: posts }, { data: events }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, body, status, created_at, reviewed_at, moderation_message, slug, center:centers!posts_center_id_fkey(name, slug)")
      .eq("submitted_by", profileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("events")
      .select("id, title, description, status, created_at, reviewed_at, moderation_message, starts_at, center:centers!events_center_id_fkey(name, slug)")
      .eq("submitted_by", profileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  type P = { id: string; title: string | null; body: string | null; status: string; created_at: string; reviewed_at: string | null; moderation_message: string | null; slug: string; center: { name: string; slug: string } | null };
  type E = { id: string; title: string; description: string | null; status: string; created_at: string; reviewed_at: string | null; moderation_message: string | null; starts_at: string; center: { name: string; slug: string } | null };
  const out: MyProposal[] = [
    ...((posts ?? []) as unknown as P[]).map((p) => ({ kind: "post" as const, id: p.id, title: p.title, body: p.body, status: p.status, created_at: p.created_at, reviewed_at: p.reviewed_at, moderation_message: p.moderation_message, slug: p.slug, starts_at: null, center: p.center })),
    ...((events ?? []) as unknown as E[]).map((e) => ({ kind: "event" as const, id: e.id, title: e.title, body: e.description, status: e.status, created_at: e.created_at, reviewed_at: e.reviewed_at, moderation_message: e.moderation_message, slug: null, starts_at: e.starts_at, center: e.center })),
  ];
  return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export type { FeedPost };
