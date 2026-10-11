"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";

export type AuditEntry = { id: number; action: string; entity_type: string; entity_id: string | null; created_at: string; actor: { id: string; name: string } | null; summary: string | null; changed: string[] };
export type AuditFilters = { actor?: string | null; action?: string | null; entity?: string | null; from?: string | null; to?: string | null; cursor?: number | null };

/** Journal d'audit paginé (éditeurs ; les admins voient tout, les éditeurs leurs propres actions). */
export async function fetchAudit(f: AuditFilters): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("studio_audit", {
    p_actor: f.actor && z.uuid().safeParse(f.actor).success ? f.actor : null,
    p_action: f.action || null,
    p_entity: f.entity || null,
    p_from: f.from ? new Date(f.from).toISOString() : null,
    p_to: f.to ? new Date(new Date(f.to).getTime() + 86_400_000).toISOString() : null,
    p_cursor: f.cursor ?? null,
    p_limit: 50,
  });
  return ((data ?? []) as unknown as AuditEntry[]) ?? [];
}

const incidentSchema = z.object({
  title: z.string().trim().min(3, "Titre trop court.").max(120, "120 caractères maximum."),
  service: z.enum(["app", "db", "storage", "video", "notifications", "messaging"]),
  note: z.string().trim().max(1000, "1000 caractères maximum.").transform((s) => s || null),
});

type Result = { ok: true } | { ok: false; error: string };

/** Déclare un incident (administrateurs), visible sur /etat. */
export async function declareIncident(input: { title: string; service: string; note: string }): Promise<Result> {
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Valeur invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("incidents").insert({ ...parsed.data, created_by: user.id });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/etat");
  revalidatePath("/studio/journal");
  return { ok: true };
}

export async function resolveIncident(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("incidents").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/etat");
  revalidatePath("/studio/journal");
  return { ok: true };
}
