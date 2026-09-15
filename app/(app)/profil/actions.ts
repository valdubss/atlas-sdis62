"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/lib/validation/profile";
import { setPasswordSchema } from "@/lib/validation/auth";

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
  });

  if (!parsed.success) {
    return { status: "error", message: "Vérifiez les champs.", fields: fieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);

  if (error) {
    return { status: "error", message: "Enregistrement impossible. Réessayez." };
  }

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
    const weak = /weak|pwned|leaked|compromised/i.test(error.message);
    return {
      status: "error",
      message: weak
        ? "Ce mot de passe est trop faible ou connu dans des fuites de données. Choisissez-en un autre."
        : "Modification impossible. Reconnectez-vous puis réessayez.",
    };
  }

  return { status: "saved" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
