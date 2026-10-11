import { createClient } from "@/lib/supabase/server";

export type AdoptionStats = {
  generated_at: string;
  accounts: { total: number; active: number; onboarded: number; with_password: number; readers: number; editors: number; admins: number; referents: number; new_7d: number; new_30d: number; never_signed_in: number; seen_7d: number; seen_30d: number; attached: number; unattached: number };
  weekly: { week: string; signups: number; active: number }[];
  centers: { total: number; without_contact: number; without_members: number; with_notes: number; list_without_contact: { id: string; name: string; slug: string; members: number }[] };
  requests: { pending: number; accepted_30d: number; declined_30d: number };
  content: { posts_30d: number; notes_30d: number; messages_7d: number; comments_30d: number; push_devices: number };
};

/** Tableau de bord d'adoption (administrateurs ; null si refusé). */
export async function fetchAdoptionStats(): Promise<AdoptionStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_adoption_stats");
  if (error || !data) return null;
  return data as unknown as AdoptionStats;
}
