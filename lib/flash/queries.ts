import "server-only";

import { createClient } from "@/lib/supabase/server";

export type FlashItem = {
  id: string;
  title: string;
  body: string | null;
  level: "info" | "urgent";
  url: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  deleted_at: string | null;
};

const SELECT = "id, title, body, level, url, starts_at, ends_at, created_at, deleted_at";

/** Flashs actuellement affichés aux agents. */
export async function fetchActiveFlashes(): Promise<FlashItem[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("flashes")
    .select(SELECT)
    .is("deleted_at", null)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("level", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3);
  return (data ?? []) as unknown as FlashItem[];
}

/** Tous les flashs récents pour le Studio (30 derniers jours). */
export async function fetchFlashesStudio(): Promise<FlashItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("flashes")
    .select(SELECT)
    .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as FlashItem[];
}
