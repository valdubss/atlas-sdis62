import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Publications en ligne proposées comme lien dans l'éditeur d'événement. */
export async function loadPostRefs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("id, slug, title")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(100);
  return (data ?? []) as { id: string; slug: string; title: string | null }[];
}
