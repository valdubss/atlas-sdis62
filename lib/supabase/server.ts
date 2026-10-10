import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database, Profile } from "./database.types";

/**
 * Client Supabase pour les Server Components, Server Actions et Route Handlers.
 * Respecte la RLS de l'utilisateur connecté (cookies de session).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : les cookies sont
            // rafraîchis par le middleware, on ignore.
          }
        },
      },
    },
  );
}

/**
 * Utilisateur courant + profil, mis en cache pour la durée de la requête.
 * Retourne null si non connecté ou profil désactivé.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  // Le middleware a déjà validé le jeton auprès de Supabase pour cette requête :
  // on lit la session depuis le cookie (aucun aller-retour réseau). Les données
  // restent protégées par la RLS, qui vérifie la signature du jeton côté base.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session ? decodeJwtUser(session.access_token) : null;
  if (!user) return null;

  // La colonne email n'est plus accordée au rôle authenticated (migration 0033) :
  // on lit les autres colonnes en base et l'adresse dans le jeton de session.
  let { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle()
    .then((r) => ({ data: r.data ? ({ ...r.data, email: user.email ?? "" } as Profile) : null }));

  if (!profile) {
    // Compte sans profil (créé avant la migration, ou via le dashboard) :
    // auto-réparation si l'adresse est autorisée (migration 0002).
    const { data: repaired } = await supabase.rpc("ensure_profile");
    profile = (repaired as Profile | null) ?? null;
  }

  if (!profile || !profile.is_active) return null;

  return { user, profile: profile as Profile };
});

/** Colonnes de profiles lisibles par tout agent connecté (tout sauf email). */
export const PROFILE_COLUMNS = "id, first_name, last_name, center_id, service_id, job_title, directory_visible, work_phone, present_me, center_joined_at, role, avatar_key, is_active, onboarded_at, created_at, updated_at";

/** Identité minimale lue dans le jeton (sub, email), sans aller-retour réseau. */
function decodeJwtUser(token: string): { id: string; email: string | null } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub?: string; email?: string; exp?: number };
    if (!payload.sub) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { id: payload.sub, email: payload.email ?? null };
  } catch {
    return null;
  }
}

export function isEditorRole(role: Profile["role"] | undefined | null) {
  return role === "editor" || role === "admin";
}
