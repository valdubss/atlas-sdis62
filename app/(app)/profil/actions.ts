"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileSchema } from "@/lib/validation/profile";
import { setPasswordSchema } from "@/lib/validation/auth";
import { getStorage } from "@/lib/storage";

export type ProfileState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string; fields?: Record<string, string> };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = profileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    personal_email: formData.get("personal_email") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: "Vérifiez les champs.", fields: fieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { personal_email, ...names } = parsed.data;
  const { error } = await supabase.from("profiles").update(names).eq("id", user.id);
  if (error) {
    return { status: "error", message: "Enregistrement impossible. Réessayez." };
  }
  // La colonne personal_email n'est pas accordée au rôle authenticated (elle ne doit jamais
  // apparaître dans l'annuaire) : écrite par le serveur seulement
  const { error: personalError } = await createAdminClient().from("profiles").update({ personal_email }).eq("id", user.id);
  if (personalError) return { status: "error", message: "Enregistrement de l'adresse personnelle impossible. Réessayez." };

  revalidatePath("/profil");
  revalidatePath("/");
  return { status: "saved" };
}

/** Définit ou remplace le mot de passe de l'utilisateur connecté. */
export async function setPassword(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Vérifiez les champs.", fields: fieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const m = error.message;
    // Raisons renvoyées par Supabase Auth, traduites pour l'agent
    if (/different from the old|same password|same_password/i.test(m)) return { status: "error", message: "C'est déjà votre mot de passe actuel : choisissez-en un différent." };
    if (/weak|pwned|leaked|compromised/i.test(m)) return { status: "error", message: "Ce mot de passe est trop faible ou connu dans des fuites de données. Choisissez-en un autre." };
    if (/should contain|at least|characters|requirements/i.test(m)) return { status: "error", message: "Mot de passe refusé : " + m };
    if (/reauthent|nonce/i.test(m)) return { status: "error", message: "Par sécurité, reconnectez-vous avec le lien e-mail puis enregistrez le mot de passe dans la foulée." };
    if (/session|jwt|token|expired/i.test(m)) return { status: "error", message: "Votre session a expiré : reconnectez-vous avec le lien e-mail puis réessayez." };
    return { status: "error", message: "Modification impossible (" + m + "). Reconnectez-vous puis réessayez." };
  }
  // Noté côté ATLAS puis recopié dans le jeton (rafraîchi tout de suite pour le proxy)
  await supabase.rpc("mark_password_set");
  await supabase.auth.refreshSession();

  return { status: "saved" };
}

export type DeleteAccountState = { status: "idle" } | { status: "error"; message: string };

/**
 * Profil → « Supprimer mon compte » : l'agent efface lui-même son compte. Mêmes étapes que la
 * suppression par un administrateur (anonymize_user_data : traces effacées, commentaires et
 * messages conservés sans auteur, profil retiré), puis la photo, la ligne de la liste des
 * agents (matricule libre pour une nouvelle première connexion) et le compte de connexion.
 * Un administrateur ne peut pas se supprimer lui-même (il en faut toujours un).
 */
export async function deleteOwnAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  if (String(formData.get("delete_confirm") ?? "").trim().toUpperCase() !== "SUPPRIMER") return { status: "error", message: "Écrivez SUPPRIMER pour confirmer." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("role, matricule, avatar_key").eq("id", user.id).maybeSingle();
  if (me?.role === "admin") return { status: "error", message: "Un administrateur ne peut pas supprimer son propre compte : demandez à un autre administrateur." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { status: "error", message: "Suppression indisponible pour le moment. Contactez le service communication." };
  }

  const { error: rpcError } = await admin.rpc("anonymize_user_data", { p_user_id: user.id });
  if (rpcError) return { status: "error", message: "Suppression impossible. Réessayez ; si le problème persiste, contactez le service communication." };

  // Le matricule redevient libre pour une nouvelle première connexion
  if (me?.matricule) await admin.from("agents_registry").update({ personal_email: null, activated_at: null }).eq("matricule", me.matricule);
  if (me?.avatar_key) await getStorage().deleteObjects([me.avatar_key]).catch(() => {});
  // Le profil n'existe plus : même si cet appel échouait, la session serait fermée au prochain passage
  await admin.auth.admin.deleteUser(user.id);

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?info=supprime");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Profil → Apparence : thème système / sombre / clair (user_settings.theme). */
export async function updateTheme(theme: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (theme !== "system" && theme !== "light" && theme !== "dark") return { ok: false, error: "Thème inconnu." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("user_settings").upsert({ user_id: user.id, theme }, { onConflict: "user_id" });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}
