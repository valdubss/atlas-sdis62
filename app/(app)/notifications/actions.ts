"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchUnreadCount } from "@/lib/notifications/queries";

/** Nombre de non-lues (cloche, rafraîchie côté client). */
export async function getUnreadCount(): Promise<number> {
  return fetchUnreadCount();
}

/** Supprime une notification de l'agent (balayage dans la liste). */
export async function deleteNotification(id: number): Promise<{ ok: boolean }> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  return { ok: !error };
}

/** Marque toutes les notifications de l'agent comme lues (ouverture de la page). */
export async function markAllRead(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mark_notifications_read");
  return (data as number | null) ?? 0;
}
