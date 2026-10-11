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
  /** Événement de centre (visible par ses membres) ; null pour tout le SDIS */
  center?: { name: string } | null;
  created_at: string;
  /** Participants déclarés et participation de l'agent (agenda) */
  participants?: number;
  participating?: boolean;
};

const SELECT = "id, title, description, location, starts_at, ends_at, all_day, status, created_at, post:posts!events_post_id_fkey(id, slug, title)";
const SELECT_WITH_CENTER = `${SELECT}, center:centers!events_center_id_fkey(name)`;

/**
 * Événements visibles par l'agent : ceux de tout le SDIS, plus ceux de son
 * centre (la RLS ne renvoie les événements de centre qu'à ses membres).
 */
export async function fetchAgenda(): Promise<{ upcoming: EventItem[]; past: EventItem[] }> {
  const supabase = await createClient();
  const now = new Date();
  const horizonPast = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase
      .from("events")
      .select(SELECT_WITH_CENTER)
      .eq("status", "published")
      .is("deleted_at", null)
      .or(`ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${new Date(now.getTime() - 3 * 3600_000).toISOString()})`)
      .order("starts_at", { ascending: true })
      .limit(200),
    supabase
      .from("events")
      .select(SELECT_WITH_CENTER)
      .eq("status", "published")
      .is("deleted_at", null)
      .lt("starts_at", now.toISOString())
      .gte("starts_at", horizonPast)
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);
  const up = (upcoming ?? []) as unknown as EventItem[];
  const ids = new Set(up.map((e) => e.id));
  const pastList = ((past ?? []) as unknown as EventItem[]).filter((e) => !ids.has(e.id));
  // Participants : un seul appel pour tous les événements affichés
  const all = [...up, ...pastList];
  if (all.length > 0) {
    const { data } = await supabase.rpc("events_participation", { p_events: all.map((e) => e.id) });
    const map = new Map(((data ?? []) as unknown as { event_id: string; count: number; mine: boolean }[]).map((r) => [r.event_id, r]));
    for (const e of all) {
      const r = map.get(e.id);
      e.participants = Number(r?.count ?? 0);
      e.participating = Boolean(r?.mine);
    }
  }
  return { upcoming: up, past: pastList };
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

/** Prochain événement départemental (pastille « Agenda » sous les stories). */
export async function fetchNextEvent(): Promise<EventItem | null> {
  const supabase = await createClient();
  const now = Date.now();
  const { data } = await supabase
    .from("events")
    .select(SELECT)
    .eq("status", "published")
    .is("deleted_at", null)
    .is("center_id", null)
    .or(`ends_at.gte.${new Date(now).toISOString()},and(ends_at.is.null,starts_at.gte.${new Date(now - 3 * 3600_000).toISOString()})`)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as unknown as EventItem | null) ?? null;
}
