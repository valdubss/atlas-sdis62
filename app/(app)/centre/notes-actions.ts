"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";
import { NOTE_LIMITS } from "@/lib/centres/notes";
import { friendlyDbError } from "@/lib/validation/comment";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

async function managerOf(centerId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, manager: false };
  const { data } = await supabase.rpc("can_manage_center", { p_center: centerId });
  return { supabase, user, manager: Boolean(data) };
}

function humanError(message: string | undefined) {
  const m = message ?? "";
  if (m.includes("row-level security") || m.includes("ACCES_REFUSE")) return "Réservé au chef de centre, au responsable communication et au service communication.";
  return friendlyDbError(m);
}

const signSchema = z.object({ center_id: z.uuid(), mime: z.string().max(100), size: z.number().int().positive(), name: z.string().max(200).optional() });

/**
 * Signe l'envoi direct du fichier d'une note (PDF ou image) sous
 * `notes/<centre>/…`. Chef de centre, responsable com ou service communication.
 */
export async function signNoteUpload(input: { center_id: string; mime: string; size: number; name?: string }): Promise<Result<{ key: string; url: string; headers: Record<string, string>; kind: "pdf" | "image" }>> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fichier invalide." };
  const v = parsed.data;
  const isPdf = v.mime === "application/pdf";
  const isImage = IMAGE_MIMES.includes(v.mime);
  if (!isPdf && !isImage) return { ok: false, error: "PDF ou image (JPG, PNG) seulement." };
  if (isPdf && v.size > NOTE_LIMITS.pdfMaxBytes) return { ok: false, error: "PDF de 25 Mo au plus." };
  if (isImage && v.size > NOTE_LIMITS.imageMaxBytes) return { ok: false, error: "Image trop lourde." };
  const { user, manager } = await managerOf(v.center_id);
  if (!user) return { ok: false, error: "Session expirée." };
  if (!manager) return { ok: false, error: "Réservé au chef de centre, au responsable communication et au service communication." };
  const ext = isPdf ? "pdf" : v.mime === "image/png" ? "png" : v.mime === "image/webp" ? "webp" : "jpg";
  const key = `notes/${v.center_id}/${randomUUID()}.${ext}`;
  try {
    const signed = await getStorage().presignUpload(key, v.mime, v.size);
    return { ok: true, key, url: signed.url, headers: signed.headers, kind: isPdf ? "pdf" : "image" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Signature impossible." };
  }
}

const publishSchema = z.object({
  center_id: z.uuid(),
  title: z.string().trim().min(1, "Donnez un titre à la note.").max(NOTE_LIMITS.titleMax, "Titre trop long (140 caractères)."),
  body: z.string().trim().max(NOTE_LIMITS.bodyMax, "Texte trop long (2 000 caractères).").transform((s) => s || null),
  kind: z.enum(["pdf", "image"]),
  file_key: z.string().min(1, "Ajoutez un document.").max(300),
  file_name: z.string().trim().max(200).transform((s) => s || null),
  file_size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  pinned: z.boolean(),
});

/** Publie une note de service (visible tout de suite par les membres du centre). */
export async function publishNote(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };
  const v = parsed.data;
  if (!v.file_key.startsWith(`notes/${v.center_id}/`)) return { ok: false, error: "Document invalide." };
  const { supabase, user, manager } = await managerOf(v.center_id);
  if (!user) return { ok: false, error: "Session expirée." };
  if (!manager) return { ok: false, error: "Réservé au chef de centre, au responsable communication et au service communication." };
  const { data, error } = await supabase
    .from("center_notes")
    .insert({ center_id: v.center_id, author_id: user.id, title: v.title, body: v.body, kind: v.kind, file_key: v.file_key, file_name: v.file_name, file_size: v.file_size, width: v.width, height: v.height, pinned: v.pinned })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: humanError(error?.message) };
  revalidatePath("/centre");
  return { ok: true, id: data.id };
}

/** Épingle ou désépingle une note (en tête de liste). */
export async function pinNote(noteId: string, pinned: boolean): Promise<Result> {
  if (!z.uuid().safeParse(noteId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("center_notes").update({ pinned }, { count: "exact" }).eq("id", noteId);
  if (error) return { ok: false, error: humanError(error.message) };
  if (!count) return { ok: false, error: "Réservé au chef de centre, au responsable communication et au service communication." };
  revalidatePath("/centre");
  return { ok: true };
}

/** Retire une note (le fichier est effacé du stockage). */
export async function deleteNote(noteId: string): Promise<Result> {
  if (!z.uuid().safeParse(noteId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("center_notes").select("file_key").eq("id", noteId).maybeSingle();
  const { error, count } = await supabase.from("center_notes").update({ deleted_at: new Date().toISOString() }, { count: "exact" }).eq("id", noteId);
  if (error) return { ok: false, error: humanError(error.message) };
  if (!count) return { ok: false, error: "Réservé au chef de centre, au responsable communication et au service communication." };
  if (row?.file_key) getStorage().deleteObjects([row.file_key]).catch(() => {});
  revalidatePath("/centre");
  return { ok: true };
}
