import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchLivesStudio } from "@/lib/direct/queries";
import { DirectAdmin } from "@/components/studio/DirectAdmin";

export const metadata: Metadata = { title: "Direct" };
export const dynamic = "force-dynamic";

/** Studio → Direct : créer et suivre les Directs (service communication). */
export default async function DirectPage() {
  const supabase = await createClient();
  const [lives, { data: centers }] = await Promise.all([fetchLivesStudio(), supabase.from("centers").select("id, name").eq("is_active", true).order("sort_order").order("name")]);
  const videoConfigured = Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_STREAM_API_TOKEN);
  return <DirectAdmin lives={lives} centers={centers ?? []} videoConfigured={videoConfigured} />;
}
