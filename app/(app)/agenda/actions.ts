"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";

export type Participant = { id: string; name: string | null; center: string | null; avatar_key: string | null; at: string };

/** « Je participe » / « Je ne participe plus » : ligne propre à l'agent (RLS), compteur renvoyé. */
export async function setParticipation(eventId: string, going: boolean): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(eventId).success) return { ok: false, error: "Événement invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = going
    ? await supabase.from("event_participations").upsert({ event_id: eventId, user_id: user.id }, { onConflict: "event_id,user_id", ignoreDuplicates: true })
    : await supabase.from("event_participations").delete().eq("event_id", eventId).eq("user_id", user.id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  const { data } = await supabase.rpc("events_participation", { p_events: [eventId] });
  const count = ((data ?? []) as { event_id: string; count: number }[])[0]?.count ?? 0;
  revalidatePath("/agenda");
  return { ok: true, count };
}

/** Participants nommés : service communication, chef ou responsable com du centre (sinon liste vide). */
export async function fetchParticipants(eventId: string): Promise<Participant[]> {
  if (!z.uuid().safeParse(eventId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("event_participants", { p_event: eventId });
  return ((data ?? []) as unknown as Participant[]) ?? [];
}
