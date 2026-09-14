"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, getAllowedDomains } from "@/lib/auth/domains";
import { loginSchema, passwordLoginSchema } from "@/lib/validation/auth";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function notAllowedMessage() {
  const domains = getAllowedDomains();
  return domains.length > 0
    ? `Seules les adresses ${domains.map((d) => "@" + d).join(", ")} (ou autorisées individuellement) sont acceptées.`
    : "Aucun domaine e-mail autorisé n'est configuré (ALLOWED_EMAIL_DOMAINS).";
}

/** Connexion par lien magique (par défaut). */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  }
  const { email } = parsed.data;

  if (!isAllowedEmail(email)) {
    return { status: "error", message: notAllowedMessage() };
  }

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    h.get("origin") ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const next = safeNext(formData.get("next") as string | null);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    // Le trigger SQL refuse les adresses non autorisées (défense en profondeur).
    if (error.message.includes("DOMAINE_NON_AUTORISE") || error.message.includes("Database error")) {
      return { status: "error", message: "Cette adresse n'est pas autorisée." };
    }
    if (error.status === 429) {
      return {
        status: "error",
        message: "Trop de demandes. Patientez quelques minutes avant de réessayer.",
      };
    }
    return { status: "error", message: "Envoi impossible pour le moment. Réessayez." };
  }

  return { status: "sent", email };
}

/**
 * Connexion par mot de passe (option pour les administrateurs / éditeurs).
 * Le mot de passe se définit depuis la page Profil après une première
 * connexion par lien magique.
 */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const { email, password } = parsed.data;

  if (!isAllowedEmail(email)) {
    return { status: "error", message: notAllowedMessage() };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) {
      return { status: "error", message: "Trop de tentatives. Patientez quelques minutes." };
    }
    return {
      status: "error",
      message:
        "Identifiants incorrects. Si vous n'avez pas encore défini de mot de passe, utilisez le lien magique.",
    };
  }

  redirect(safeNext(formData.get("next") as string | null));
}
