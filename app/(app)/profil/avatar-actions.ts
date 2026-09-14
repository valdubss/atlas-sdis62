"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";
import { makeAvatar } from "@/lib/media/variants";
import { mediaKeys } from "@/lib/media/keys";

type Result = { ok: true; avatar_key: string | null } | { ok: false; error: string };

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Photo de profil : reçue déjà réduite par le navigateur (carré ≤ 512 px),
 * recadrée en 256 px WebP côté serveur, stockée sous une clé versionnée
 * (le navigateur ne garde jamais l'ancienne image en cache).
 */
export async function updateAvatar(formData: FormData): Promise<Result> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choisissez une image." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Le fichier doit être une image." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Image trop lourde (6 Mo max)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: me } = await supabase.from("profiles").select("avatar_key").eq("id", user.id).maybeSingle();

  let webp: Buffer;
  try {
    webp = await makeAvatar(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { ok: false, error: "Image illisible." };
  }
  const key = mediaKeys.avatar(user.id, Date.now());
  const storage = getStorage();
  try {
    await storage.putObject(key, webp, "image/webp");
  } catch (e) {
    console.error("avatar putObject", e);
    return { ok: false, error: "Stockage indisponible. Réessayez." };
  }
  const { error } = await supabase.from("profiles").update({ avatar_key: key }).eq("id", user.id);
  if (error) {
    storage.deleteObjects([key]).catch(() => {});
    return { ok: false, error: "Enregistrement impossible." };
  }
  if (me?.avatar_key && me.avatar_key !== key) storage.deleteObjects([me.avatar_key]).catch(() => {});
  revalidatePath("/profil");
  revalidatePath("/");
  return { ok: true, avatar_key: key };
}

/** Retire la photo de profil (retour aux initiales). */
export async function removeAvatar(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: me } = await supabase.from("profiles").select("avatar_key").eq("id", user.id).maybeSingle();
  const { error } = await supabase.from("profiles").update({ avatar_key: null }).eq("id", user.id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  if (me?.avatar_key) getStorage().deleteObjects([me.avatar_key]).catch(() => {});
  revalidatePath("/profil");
  revalidatePath("/");
  return { ok: true, avatar_key: null };
}
