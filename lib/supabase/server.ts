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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return { user, profile: profile as Profile };
});

export function isEditorRole(role: Profile["role"] | undefined | null) {
  return role === "editor" || role === "admin";
}
