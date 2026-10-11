"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";
import { DOC_LIMITS } from "@/lib/documents/types";
import { friendlyDbError } from "@/lib/validation/comment";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

async function editor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ok: false };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { supabase, user, ok: me?.role === "editor" || me?.role === "admin" };
}

const signSchema = z.object({ mime: z.string().max(100), size: z.number().int().positive(), name: z.string().max(200).optional() });

/** Signe l'envoi direct du fichier d'un document (PDF ou image) sous `documents/…`. Service communication. */
export async function signDocumentUpload(input: { mime: string; size: number; name?: string }): Promise<Result<{ key: string; url: string; headers: Record<string, string>; kind: "pdf" | "image" }>> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fichier invalide." };
  const v = parsed.data;
  const isPdf = v.mime === "application/pdf";
  const isImage = IMAGE_MIMES.includes(v.mime);
  if (!isPdf && !isImage) return { ok: false, error: "PDF ou image (JPG, PNG) seulement." };
  if (isPdf && v.size > DOC_LIMITS.pdfMaxBytes) return { ok: false, error: "PDF de 40 Mo au plus." };
  if (isImage && v.size > DOC_LIMITS.imageMaxBytes) return { ok: false, error: "Image trop lourde (12 Mo)." };
  const { user, ok } = await editor();
  if (!user) return { ok: false, error: "Session expirée." };
  if (!ok) return { ok: false, error: "Réservé au service communication." };
  const ext = isPdf ? "pdf" : v.mime === "image/png" ? "png" : v.mime === "image/webp" ? "webp" : "jpg";
  const key = `documents/${randomUUID()}.${ext}`;
  try {
    const signed = await getStorage().presignUpload(key, v.mime, v.size);
    return { ok: true, key, url: signed.url, headers: signed.headers, kind: isPdf ? "pdf" : "image" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Signature impossible." };
  }
}

const saveSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Donnez un titre.").max(DOC_LIMITS.titleMax, "Titre trop long (140 caractères)."),
  category: z.string().trim().min(1, "Indiquez une catégorie.").max(DOC_LIMITS.categoryMax, "Catégorie trop longue (60 caractères)."),
  description: z.string().trim().max(DOC_LIMITS.descriptionMax, "Description trop longue (500 caractères).").transform((s) => s || null),
  kind: z.enum(["pdf", "image"]).optional(),
  file_key: z.string().min(1).max(300).optional(),
  file_name: z.string().trim().max(200).transform((s) => s || null).optional(),
  file_size: z.number().int().nonnegative().optional(),
  published: z.boolean(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

/** Crée ou met à jour un document (le fichier est facultatif en modification). */
export async function saveDocument(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };
  const v = parsed.data;
  const { supabase, user, ok } = await editor();
  if (!user) return { ok: false, error: "Session expirée." };
  if (!ok) return { ok: false, error: "Réservé au service communication." };
  const base = { title: v.title, category: v.category, description: v.description, published: v.published, ...(v.sort_order !== undefined ? { sort_order: v.sort_order } : {}) };
  const file = v.file_key && v.kind ? { kind: v.kind, file_key: v.file_key, file_name: v.file_name ?? null, file_size: v.file_size ?? 0 } : {};
  let id = v.id;
  let oldKey: string | null = null;
  if (id) {
    const { data: prev } = await supabase.from("documents").select("file_key").eq("id", id).maybeSingle();
    if (!prev) return { ok: false, error: "Document introuvable." };
    if (v.file_key && v.file_key !== prev.file_key) oldKey = prev.file_key;
    const { error } = await supabase.from("documents").update({ ...base, ...file }).eq("id", id);
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  } else {
    if (!v.file_key || !v.kind) return { ok: false, error: "Ajoutez un fichier." };
    const { data, error } = await supabase
      .from("documents")
      .insert({ ...base, ...file, author_id: user.id } as never)
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: friendlyDbError(error?.message) };
    id = data.id;
  }
  if (oldKey) getStorage().deleteObjects([oldKey]).catch(() => {});
  revalidatePath("/documents");
  revalidatePath("/admin/documents");
  return { ok: true, id: id! };
}

/** Retire un document (effacé de la liste ; le fichier est supprimé du stockage). */
export async function deleteDocument(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, ok } = await editor();
  if (!user) return { ok: false, error: "Session expirée." };
  if (!ok) return { ok: false, error: "Réservé au service communication." };
  const { data: prev } = await supabase.from("documents").select("file_key").eq("id", id).maybeSingle();
  const { error } = await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  if (prev?.file_key) getStorage().deleteObjects([prev.file_key]).catch(() => {});
  revalidatePath("/documents");
  revalidatePath("/admin/documents");
  return { ok: true };
}
