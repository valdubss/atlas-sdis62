"use server";

import { createClient } from "@/lib/supabase/server";

/** Marque toutes les notifications de l'agent comme lues (ouverture de la page). */
export async function markAllRead(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mark_notifications_read");
  return (data as number | null) ?? 0;
}
