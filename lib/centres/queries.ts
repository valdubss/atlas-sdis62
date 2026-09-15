import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Center, Grouping, Service } from "@/lib/supabase/database.types";
import type { FeedPost } from "@/lib/feed/types";
import type { EventItem } from "@/lib/agenda/queries";

export type PersonRef = { id: string; first_name: string; last_name: string; avatar_key: string | null; job_title: string | null; email?: string };
export type ReferentRow = { id: string; since: string; ended_at: string | null; is_active: boolean; profile: PersonRef | null };
export type CenterWithRefs = Center & { grouping: Grouping | null; chief: PersonRef | null; referents: ReferentRow[]; cover: { id: string; variants: Record<string, string> } | null };

const PERSON = "id, first_name, last_name, avatar_key, job_title";

export const fetchGroupings = cache(async (): Promise<Grouping[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("groupings").select("*").order("sort_order").order("name");
  return (data ?? []) as Grouping[];
});

export async function fetchCentersStudio(): Promise<(Center & { grouping: { name: string } | null; referents_count: number })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("centers")
    .select("*, grouping:groupings!centers_grouping_id_fkey(name), referents:center_referents(count)")
    .order("sort_order")
    .order("name");
  return ((data ?? []) as unknown as (Center & { grouping: { name: string } | null; referents: { count: number }[] })[]).map((c) => ({
    ...c,
    referents_count: c.referents?.[0]?.count ?? 0,
  }));
}

export const fetchCenterById = cache(async (id: string): Promise<CenterWithRefs | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("centers")
    .select(
      `*, grouping:groupings!centers_grouping_id_fkey(*), chief:profiles!centers_chief_id_fkey(${PERSON}), cover:media!centers_cover_media_id_fkey(id, variants), referents:center_referents(id, since, ended_at, is_active, profile:profiles!center_referents_profile_id_fkey(${PERSON}, email))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as CenterWithRefs;
  row.referents = [...(row.referents ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.since.localeCompare(a.since));
  return row;
});

export async function fetchServicesStudio(): Promise<(Service & { manager: PersonRef | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("services").select(`*, manager:profiles!services_manager_id_fkey(${PERSON})`).order("sort_order").order("name");
  return (data ?? []) as unknown as (Service & { manager: PersonRef | null })[];
}

export const fetchServiceById = cache(async (id: string): Promise<(Service & { manager: PersonRef | null }) | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("services").select(`*, manager:profiles!services_manager_id_fkey(${PERSON})`).eq("id", id).maybeSingle();
  return (data as unknown as (Service & { manager: PersonRef | null }) | null) ?? null;
});

export type PendingPost = FeedPost & { created_at: string; center: { id: string; name: string; slug: string; grouping_id: string | null } | null; submitter: PersonRef | null };
export type PendingEvent = EventItem & { center: { id: string; name: string; slug: string; grouping_id: string | null } | null; submitter: PersonRef | null; description: string | null; location: string | null };

/** File de validation : propositions de centre en attente (posts + événements). */
export async function fetchPendingProposals(): Promise<{ posts: PendingPost[]; events: PendingEvent[] }> {
  const supabase = await createClient();
  const [{ data: ids }, { data: events }] = await Promise.all([
    supabase.from("posts").select("id, created_at").eq("scope", "center").eq("status", "pending").is("deleted_at", null).order("created_at", { ascending: true }).limit(200),
    supabase
      .from("events")
      .select(`id, title, description, location, starts_at, ends_at, all_day, status, created_at, post:posts!events_post_id_fkey(id, slug, title), center:centers!events_center_id_fkey(id, name, slug, grouping_id), submitter:profiles!events_submitted_by_fkey(${PERSON})`)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  const posts: PendingPost[] = [];
  for (const { id, created_at } of ids ?? []) {
    const { data } = await supabase.rpc("get_post_by_id", { p_id: id });
    if (!data) continue;
    const post = data as unknown as FeedPost;
    const [{ data: center }, { data: submitter }] = await Promise.all([
      post.center_id ? supabase.from("centers").select("id, name, slug, grouping_id").eq("id", post.center_id).maybeSingle() : Promise.resolve({ data: null }),
      post.submitted_by ? supabase.from("profiles").select(PERSON).eq("id", post.submitted_by).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    posts.push({ ...post, created_at, center: (center as PendingPost["center"]) ?? null, submitter: (submitter as PersonRef | null) ?? null });
  }
  return { posts, events: (events ?? []) as unknown as PendingEvent[] };
}

/** Posts de centre publiés récemment (promotion au fil). */
export async function fetchPublishedCenterPosts(limit = 30): Promise<(FeedPost & { center: { id: string; name: string; slug: string } | null; promoted: boolean })[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("posts")
    .select("id, center:centers!posts_center_id_fkey(id, name, slug), promotions:posts!posts_promoted_from_id_fkey(id)")
    .eq("scope", "center")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  const out = [];
  for (const r of (rows ?? []) as unknown as { id: string; center: { id: string; name: string; slug: string } | null; promotions: { id: string }[] }[]) {
    const { data } = await supabase.rpc("get_post_by_id", { p_id: r.id });
    if (data) out.push({ ...(data as unknown as FeedPost), center: r.center, promoted: (r.promotions ?? []).length > 0 });
  }
  return out;
}

export async function countPendingProposals(): Promise<number> {
  const supabase = await createClient();
  const [{ count: a }, { count: b }] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("scope", "center").eq("status", "pending").is("deleted_at", null),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "pending").is("deleted_at", null),
  ]);
  return (a ?? 0) + (b ?? 0);
}
