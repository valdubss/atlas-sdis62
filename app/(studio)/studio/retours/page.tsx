import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { FeedbackList, type FeedbackRow } from "@/components/studio/FeedbackList";

export const metadata: Metadata = { title: "Retours" };
export const dynamic = "force-dynamic";

export default async function RetoursPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut = "" } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("feedback")
    .select("id, category, description, screenshot_key, context, status, created_at, handled_at, user_id, author:profiles!feedback_user_id_fkey(first_name, last_name, center:centers!profiles_center_id_fkey(name))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (statut === "new" || statut === "seen" || statut === "done") query = query.eq("status", statut);
  const { data } = await query;
  // Adresses des auteurs : vue réservée aux éditeurs (la colonne n'est plus lisible directement)
  const ids = Array.from(new Set((data ?? []).map((r) => (r as { user_id: string | null }).user_id).filter((v): v is string => Boolean(v))));
  const { data: emails } = ids.length ? await supabase.from("profiles_editor").select("id, email").in("id", ids) : { data: [] as { id: string; email: string }[] };
  const emailOf = new Map((emails ?? []).map((e) => [e.id, e.email]));
  const rows = ((data ?? []) as unknown as (FeedbackRow & { user_id: string | null })[]).map((r) => ({ ...r, author: r.author ? { ...r.author, email: (r.user_id && emailOf.get(r.user_id)) || "" } : null }));
  return <FeedbackList rows={rows} statut={statut} />;
}
