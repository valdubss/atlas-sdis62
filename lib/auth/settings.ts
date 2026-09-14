import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthSettings, type AuthSettings } from "./providers";

/**
 * Réglages d'authentification lus avec la clé service_role (la page de
 * connexion est servie à des visiteurs non connectés). Valeurs par défaut si
 * la base est injoignable.
 */
export async function getAuthSettings(): Promise<AuthSettings> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", ["auth_password_enabled", "auth_magic_link_enabled", "auth_sso_forced"]);
    const map: Record<string, unknown> = {};
    for (const row of data ?? []) map[row.key] = row.value;
    return resolveAuthSettings(map);
  } catch {
    return resolveAuthSettings({});
  }
}
