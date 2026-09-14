"use server";

import { createClient } from "@/lib/supabase/server";
import type { StoryGroup, StoryItem } from "@/lib/feed/types";

/** Stories d'une série active ou d'un à-la-une (RLS lecteur). */
export async function fetchStoryItems(group: Pick<StoryGroup, "id" | "kind">): Promise<StoryItem[]> {
  const supabase = await createClient();
  const { data, error } =
    group.kind === "highlight"
      ? await supabase.rpc("get_highlight_items", { p_highlight_id: group.id })
      : await supabase.rpc("get_story_items", { p_series_id: group.id, p_highlight_id: null });
  if (error) return [];
  return (data ?? []) as unknown as StoryItem[];
}

export async function recordStoryView(storyId: string) {
  const supabase = await createClient();
  await supabase.rpc("record_story_view", { p_story_id: storyId });
}
