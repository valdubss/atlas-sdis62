"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";
import type { CalendarItem } from "@/lib/studio/calendar";

export async function fetchCalendar(fromIso: string, toIso: string): Promise<CalendarItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("studio_calendar", { p_from: fromIso, p_to: toIso });
  if (error) return [];
  return (data ?? []) as unknown as CalendarItem[];
}

const schema = z.object({ kind: z.enum(["post", "story", "flash", "event"]), id: z.uuid(), at: z.string().datetime({ offset: true }) });

/**
 * Glisser-déposer : change la date d'un élément. Une publication ou une story
 * brouillon déposée sur un jour devient programmée ; un élément publié ne bouge pas.
 */
export async function rescheduleItem(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Déplacement invalide." };
  const { kind, id, at } = parsed.data;
  const supabase = await createClient();
  if (kind === "post" || kind === "story") {
    const table = kind === "post" ? "posts" : "stories";
    const { data: row } = await supabase.from(table).select("status").eq("id", id).maybeSingle();
    if (!row) return { ok: false, error: "Élément introuvable." };
    if (row.status === "published") return { ok: false, error: "Un contenu publié ne se reprogramme pas : dépubliez-le d'abord." };
    if (new Date(at).getTime() < Date.now() - 60_000) return { ok: false, error: "La date est déjà passée." };
    const { error } = await supabase.from(table).update({ status: "scheduled", scheduled_at: at }).eq("id", id);
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  } else if (kind === "event") {
    const { data: row } = await supabase.from("events").select("starts_at, ends_at").eq("id", id).maybeSingle();
    if (!row) return { ok: false, error: "Événement introuvable." };
    const delta = new Date(at).getTime() - new Date(row.starts_at).getTime();
    const { error } = await supabase
      .from("events")
      .update({ starts_at: at, ends_at: row.ends_at ? new Date(new Date(row.ends_at).getTime() + delta).toISOString() : null })
      .eq("id", id);
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  } else {
    const { data: row } = await supabase.from("flashes").select("starts_at, ends_at").eq("id", id).maybeSingle();
    if (!row) return { ok: false, error: "Flash introuvable." };
    const delta = new Date(at).getTime() - new Date(row.starts_at).getTime();
    const { error } = await supabase.from("flashes").update({ starts_at: at, ends_at: new Date(new Date(row.ends_at).getTime() + delta).toISOString() }).eq("id", id);
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  }
  revalidatePath("/studio/calendrier");
  revalidatePath("/studio/posts");
  revalidatePath("/studio");
  return { ok: true };
}
