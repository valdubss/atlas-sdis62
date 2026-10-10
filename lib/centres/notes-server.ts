import { createClient } from "@/lib/supabase/server";
import type { CenterNote } from "./notes";

/** Notes de service d'un centre (RLS : membres et responsables seulement, sinon liste vide). */
export async function fetchCenterNotes(centerId: string, limit = 50): Promise<CenterNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("center_notes_list", { p_center: centerId, p_limit: limit });
  if (error) {
    console.error("center_notes_list", error.message);
    return [];
  }
  return ((data ?? []) as unknown as CenterNote[]).filter((n) => n && n.id);
}
