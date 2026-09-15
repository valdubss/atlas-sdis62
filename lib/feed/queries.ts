import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { FeedCursor, FeedParams, FeedPost, MediaItem, StoryBar, StoryItem } from "./types";

export const FEED_PAGE_SIZE = 10;

export async function fetchFeed(
  params: FeedParams,
  cursor: FeedCursor = null,
  limit = FEED_PAGE_SIZE,
): Promise<FeedPost[]> {
  const supabase = await createClient();
  if (params.centerId) {
    const { data, error } = await supabase.rpc("get_center_feed", { p_center_id: params.centerId, p_limit: limit, p_cursor_at: cursor?.at ?? null, p_cursor_id: cursor?.id ?? null });
    if (error) {
      console.error("get_center_feed", error.message);
      return [];
    }
    return (data ?? []) as unknown as FeedPost[];
  }
  const { data, error } = await supabase.rpc("get_feed", {
    p_limit: limit,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_category: params.category || null,
    p_center: params.center || null,
    p_q: params.q || null,
    p_bookmarked: params.bookmarked ?? false,
    p_tag: params.tag || null,
  });
  if (error) {
    console.error("get_feed", error.message);
    return [];
  }
  return (data ?? []) as unknown as FeedPost[];
}

export async function fetchPinned(): Promise<FeedPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pinned_posts");
  if (error) {
    console.error("get_pinned_posts", error.message);
    return [];
  }
  return (data ?? []) as unknown as FeedPost[];
}

/** Mémoïsé par requête : generateMetadata et la page partagent le même appel. */
export const fetchPostBySlug = cache(async (slug: string): Promise<FeedPost | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_post", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as FeedPost;
});

export async function fetchPostById(id: string): Promise<FeedPost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_post_by_id", { p_id: id });
  if (error || !data) return null;
  return data as unknown as FeedPost;
}

export async function fetchCategories() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function fetchCenters() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("centers")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  return data ?? [];
}

export async function fetchStoryBar(): Promise<StoryBar> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_story_bar");
  if (error || !data) return { series: [], highlights: [] };
  return data as unknown as StoryBar;
}

export async function fetchStoryById(id: string): Promise<StoryItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_story_by_id", { p_id: id });
  if (error || !data) return null;
  return data as unknown as StoryItem;
}

/** Un média prêt de la bibliothèque (éditeurs), sérialisé comme dans le fil. */
export async function fetchMediaItem(id: string): Promise<MediaItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("media").select("id, kind, variants, poster_key, width, height, alt, mime, original_key, duration_s, lqip").eq("id", id).eq("status", "ready").maybeSingle();
  return data ? ({ ...data, variants: (data.variants ?? {}) as MediaItem["variants"], duration_s: data.duration_s === null ? null : Number(data.duration_s) } as MediaItem) : null;
}
