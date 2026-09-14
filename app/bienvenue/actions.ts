"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { setPasswordSchema } from "@/lib/validation/auth";

export type OnboardingState = { status: "idle" } | { status: "error"; message: string; fields?: Record<string, string> };

const name = z.string().trim().min(1, "Champ obligatoire.").max(60, "60 caractères maximum.");
const profileSchema = z.object({
  first_name: name,
  last_name: name,
  center_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid("Centre invalide.").nullable()),
});

/** Termine l'accueil : profil, centre, mot de passe si demandé, puis onboarded_at. */
export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const needPassword = formData.get("need_password") === "1";
  const parsedProfile = profileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    center_id: formData.get("center_id") ?? "",
  });
  const parsedPwd = needPassword ? setPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") }) : null;

  const fields: Record<string, string> = {};
  for (const r of [parsedProfile, parsedPwd]) {
    if (r && !r.success)
      for (const i of r.error.issues) {
        const k = String(i.path[0] ?? "");
        if (k && !fields[k]) fields[k] = i.message;
      }
  }
  if (!parsedProfile.success || (parsedPwd && !parsedPwd.success)) return { status: "error", message: "Vérifiez les champs.", fields };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ ...parsedProfile.data, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (profileError) return { status: "error", message: "Enregistrement du profil impossible." };

  if (parsedPwd?.success) {
    const { error } = await supabase.auth.updateUser({ password: parsedPwd.data.password });
    if (error) {
      const weak = /weak|pwned|leaked|compromised/i.test(error.message);
      return { status: "error", message: weak ? "Ce mot de passe est trop faible ou connu dans des fuites de données. Choisissez-en un autre." : "Enregistrement du mot de passe impossible. Reconnectez-vous puis réessayez." };
    }
  }

  // Rafraîchit le jeton pour que le middleware voie « onboarded »
  await supabase.auth.refreshSession();
  redirect("/");
}
