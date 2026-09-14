import "server-only";

import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: number;
  kind: "post" | "flash" | "reply" | "event" | "story_reply";
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

/** Nombre de notifications non lues (cloche). */
export async function fetchUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

/** Dernières notifications de l'agent connecté (RLS). */
export async function fetchNotifications(limit = 60): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, url, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as NotificationItem[];
}
