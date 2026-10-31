"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeMatricule } from "@/lib/auth/first-access-public";
import { parseRegistryText, type RegistryRow } from "@/lib/auth/registry-parse";

export type { RegistryRow };
export type RegistryImportResult = { ok: true; rows: RegistryRow[]; applied: number; valid: number } | { ok: false; error: string };
type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return me?.role === "admin" ? { supabase, user } : null;
}

/** Vérifie (apply = false) puis importe le référentiel : insertion ou mise à jour par matricule. */
export async function importRegistry(text: string, apply: boolean): Promise<RegistryImportResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: "Réservé aux administrateurs." };
  if (text.length > 3_000_000) return { ok: false, error: "Fichier trop volumineux (3 Mo maximum)." };
  const rows = parseRegistryText(text);
  if (!rows.length) return { ok: true, rows, applied: 0, valid: 0 };
  const valid = rows.filter((r) => !r.error);
  // Matricules déjà présents (pour l'aperçu « mis à jour » / « nouveau »)
  const existing = new Set<string>();
  for (let i = 0; i < valid.length; i += 500) {
    const { data } = await ctx.supabase.from("agents_registry").select("matricule").in("matricule", valid.slice(i, i + 500).map((r) => r.matricule));
    for (const d of data ?? []) existing.add(d.matricule);
  }
  for (const r of valid) r.existing = existing.has(r.matricule);
  if (!apply) return { ok: true, rows, applied: 0, valid: valid.length };

  let applied = 0;
  for (let i = 0; i < valid.length; i += 500) {
    const batch = valid.slice(i, i + 500).map((r) => ({ matricule: r.matricule, last_name: r.last_name, first_name: r.first_name, email: r.email, center_name: r.center_name, status: r.status, imported_at: new Date().toISOString() }));
    const { error } = await ctx.supabase.from("agents_registry").upsert(batch, { onConflict: "matricule" });
    if (error) return { ok: false, error: `Import interrompu à la ligne ${valid[i].line} : ${error.message}` };
    applied += batch.length;
  }
  revalidatePath("/admin/agents");
  return { ok: true, rows, applied, valid: valid.length };
}

export async function deleteRegistryEntry(matricule: string): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: "Réservé aux administrateurs." };
  const { error } = await ctx.supabase.from("agents_registry").delete().eq("matricule", normalizeMatricule(matricule));
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/admin/agents");
  return { ok: true };
}

/** Vide le référentiel (les comptes existants ne sont pas touchés). */
export async function clearRegistry(): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: "Réservé aux administrateurs." };
  const { error } = await ctx.supabase.from("agents_registry").delete().neq("matricule", "");
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/admin/agents");
  return { ok: true };
}
