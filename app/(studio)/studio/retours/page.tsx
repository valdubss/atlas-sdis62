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
    .select("id, category, description, screenshot_key, context, status, created_at, handled_at, author:profiles!feedback_user_id_fkey(first_name, last_name, email, center:centers(name))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (statut === "new" || statut === "seen" || statut === "done") query = query.eq("status", statut);
  const { data } = await query;
  return <FeedbackList rows={(data ?? []) as unknown as FeedbackRow[]} statut={statut} />;
}
