import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StoriesList, type HighlightRow, type StoryRow } from "@/components/studio/StoriesList";

export const metadata: Metadata = { title: "Stories" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  published: "Story en ligne. Elle apparaît dans le bandeau des agents.",
  scheduled: "Story programmée.",
  draft: "Brouillon enregistré.",
};

export default async function StudioStoriesPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const supabase = await createClient();
  await supabase.rpc("publish_scheduled");

  const [storiesRes, highlightsRes] = await Promise.all([
    supabase
      .from("stories")
      .select(
        "id, status, overlay, display_seconds, scheduled_at, published_at, expires_at, created_at, series:story_series!stories_series_id_fkey(id, title), media:media!stories_media_id_fkey(id, kind, variants, poster_key, original_key, alt, width, height, mime, duration_s), views:story_views(count), highlight_items:story_highlight_items(highlight_id)",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("story_highlights").select("id, title, is_active, position, items:story_highlight_items(story_id)").order("position").order("created_at"),
  ]);

  return (
    <StoriesList
      stories={(storiesRes.data ?? []) as unknown as StoryRow[]}
      highlights={(highlightsRes.data ?? []) as unknown as HighlightRow[]}
      notice={ok ? NOTICES[ok] ?? null : null}
    />
  );
}
