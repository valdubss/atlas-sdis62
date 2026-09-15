import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type EventItem = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: "draft" | "published";
  post: { id: string; slug: string; title: string | null } | null;
  created_at: string;
};

const SELECT = "id, title, description, location, starts_at, ends_at, all_day, status, created_at, post:posts!events_post_id_fkey(id, slug, title)";

/** Événements visibles par les agents : à venir (ou en cours) puis passés récents. */
export async function fetchAgenda(): Promise<{ upcoming: EventItem[]; past: EventItem[] }> {
  const supabase = await createClient();
  const now = new Date();
  const horizonPast = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase
      .from("events")
      .select(SELECT)
      .eq("status", "published")
      .is("deleted_at", null)
      .is("center_id", null)
      .or(`ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${new Date(now.getTime() - 3 * 3600_000).toISOString()})`)
      .order("starts_at", { ascending: true })
      .limit(200),
    supabase
      .from("events")
      .select(SELECT)
      .eq("status", "published")
      .is("deleted_at", null)
      .is("center_id", null)
      .lt("starts_at", now.toISOString())
      .gte("starts_at", horizonPast)
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);
  const up = (upcoming ?? []) as unknown as EventItem[];
  const ids = new Set(up.map((e) => e.id));
  return { upcoming: up, past: ((past ?? []) as unknown as EventItem[]).filter((e) => !ids.has(e.id)) };
}

/** Tous les événements pour le Studio (brouillons compris, sans les supprimés). */
export async function fetchEventsStudio(): Promise<EventItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(SELECT).is("deleted_at", null).is("center_id", null).order("starts_at", { ascending: false }).limit(500);
  return (data ?? []) as unknown as EventItem[];
}

export const fetchEventById = cache(async (id: string): Promise<EventItem | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as unknown as EventItem | null) ?? null;
});
