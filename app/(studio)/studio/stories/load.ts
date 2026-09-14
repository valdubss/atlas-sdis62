import { createClient } from "@/lib/supabase/server";

/** Séries existantes et publications récentes pour l'éditeur de story. */
export async function loadEditorData() {
  const supabase = await createClient();
  const [seriesRes, postsRes] = await Promise.all([
    supabase.from("story_series").select("id, title").order("created_at", { ascending: false }).limit(100),
    supabase.from("posts").select("id, slug, title").eq("status", "published").is("deleted_at", null).order("published_at", { ascending: false }).limit(50),
  ]);
  return { series: seriesRes.data ?? [], posts: postsRes.data ?? [] };
}
