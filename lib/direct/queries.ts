import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/feed/types";
import type { LiveEntry, LiveItem } from "./types";

const LIVE = "id, title, location, status, video, started_at, ended_at, recap_post_id, created_at, whep_url, hls_url, center:centers!lives_center_id_fkey(id, name, slug), recap:posts!lives_recap_post_id_fkey(slug)";
const ENTRY = "id, live_id, body, pinned, created_at, author:profiles!live_entries_author_id_fkey(first_name, last_name), media:media!live_entries_media_id_fkey(id, kind, variants, poster_key, width, height, alt, mime, original_key, hls_key, video_status, lqip)";

type LiveRow = Omit<LiveItem, "center" | "recap_slug"> & { center: LiveItem["center"]; recap: { slug: string } | null };
type EntryRow = Omit<LiveEntry, "author" | "media"> & { author: { first_name: string | null; last_name: string | null } | null; media: (MediaItem & { alt: string | null }) | null };

function toLive(row: LiveRow): LiveItem {
  const { recap, ...rest } = row;
  return { ...rest, recap_slug: recap?.slug ?? null };
}

function toEntry(row: EntryRow): LiveEntry {
  return {
    id: row.id,
    live_id: row.live_id,
    body: row.body,
    pinned: row.pinned,
    created_at: row.created_at,
    author: row.author ? { name: [row.author.first_name, row.author.last_name].filter(Boolean).join(" ").trim() || null } : null,
    media: row.media ? { ...row.media, alt: row.media.alt ?? "" } : null,
  };
}

/** Le Direct en cours (un seul à la fois), ou null. */
export async function fetchActiveLive(): Promise<LiveItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("lives").select(LIVE).eq("status", "live").is("deleted_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toLive(data as unknown as LiveRow) : null;
}

export async function fetchLive(id: string): Promise<LiveItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("lives").select(LIVE).eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? toLive(data as unknown as LiveRow) : null;
}

/** Entrées d'un Direct, les plus récentes d'abord (épinglées en tête). */
export async function fetchLiveEntries(liveId: string, limit = 200): Promise<LiveEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("live_entries").select(ENTRY).eq("live_id", liveId).is("deleted_at", null).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as EntryRow[]).map(toEntry);
}

/** Tous les Directs pour le Studio (brouillons compris). */
export async function fetchLivesStudio(): Promise<LiveItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("lives").select(LIVE).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  return ((data ?? []) as unknown as LiveRow[]).map(toLive);
}
