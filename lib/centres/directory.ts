import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CenterDetails, DirectoryData, PersonCard, SearchResult, ServiceDetails } from "./directory-types";

const PERSON = "id, first_name, last_name, avatar_key, job_title";
const PERSON_PHONE = "id, first_name, last_name, avatar_key, job_title, work_phone";

/** Annuaire complet (centres et services actifs), sans personnes ni photos. */
export const fetchDirectoryData = cache(async (): Promise<DirectoryData> => {
  const supabase = await createClient();
  const [{ data: groupings }, { data: centers }, { data: services }] = await Promise.all([
    supabase.from("groupings").select("id, name, sort_order").order("sort_order").order("name"),
    supabase.from("centers").select("id, slug, name, type, grouping_id, address, postal_code, city, phone, email, lat, lng").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("services").select("id, slug, name, short_description, contact_reasons, phone, email, address, grouping_id").eq("is_active", true).order("sort_order").order("name"),
  ]);
  return { generated_at: new Date().toISOString(), groupings: groupings ?? [], centers: (centers ?? []) as DirectoryData["centers"], services: (services ?? []) as DirectoryData["services"] };
});

/** Agents ayant accepté d'apparaître dans l'annuaire, pour un centre ou un service. */
export async function fetchTeam(kind: "center" | "service", id: string): Promise<PersonCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(PERSON_PHONE)
    .eq(kind === "center" ? "center_id" : "service_id", id)
    .eq("directory_visible", true)
    .eq("is_active", true)
    .order("last_name")
    .order("first_name")
    .limit(200);
  return (data ?? []) as PersonCard[];
}

export async function searchDirectory(q: string): Promise<SearchResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_directory", { p_q: q, p_limit: 20 });
  if (error || !data) return { centers: [], services: [], people: [] };
  return data as unknown as SearchResult;
}

export async function fetchDirectoryCenter(slug: string): Promise<CenterDetails | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("centers")
    .select(`id, slug, name, type, grouping_id, address, postal_code, city, phone, email, lat, lng, presentation, displayed_headcount, grouping:groupings!centers_grouping_id_fkey(name), chief:profiles!centers_chief_id_fkey(${PERSON})`)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const [{ data: refs }, people] = await Promise.all([
    supabase.from("center_referents").select(`profile:profiles!center_referents_profile_id_fkey(${PERSON})`).eq("center_id", data.id).eq("is_active", true).order("since"),
    fetchTeam("center", data.id),
  ]);
  const { chief, ...center } = data as unknown as CenterDetails["center"] & { chief: PersonCard | null };
  return {
    center,
    chief: chief ?? null,
    referents: ((refs ?? []) as unknown as { profile: PersonCard | null }[]).map((r) => r.profile).filter((p): p is PersonCard => Boolean(p)),
    people,
  };
}

export async function fetchDirectoryService(slug: string): Promise<ServiceDetails | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select(`id, slug, name, short_description, contact_reasons, phone, email, address, grouping_id, mission, manager:profiles!services_manager_id_fkey(${PERSON})`)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const { manager, ...service } = data as unknown as ServiceDetails["service"] & { manager: PersonCard | null };
  return { service, manager: manager ?? null, people: await fetchTeam("service", service.id) };
}
