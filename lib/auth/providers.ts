/**
 * Modes de connexion.
 *
 *  - password   : e-mail + mot de passe (défaut)
 *  - magic_link : lien par e-mail (première connexion, mot de passe oublié, secours)
 *  - azure      : SSO Microsoft Entra ID via Supabase Auth (provider "azure")
 *
 * Le client ID et le secret Entra se saisissent dans le dashboard Supabase
 * (Authentication → Providers → Azure). L'app n'a besoin que de
 * AUTH_OIDC_PROVIDER=azure (affiche le bouton) et, en option, AZURE_TENANT_ID.
 * Les réglages « lien magique » et « SSO forcé » sont dans app_settings.
 */
export type AuthSettings = {
  ssoEnabled: boolean;
  ssoForced: boolean;
  passwordEnabled: boolean;
  magicLinkEnabled: boolean;
};

export function ssoConfigured() {
  return process.env.AUTH_OIDC_PROVIDER === "azure";
}

/** Combine la configuration (.env) et les réglages administrateur (app_settings). */
export function resolveAuthSettings(settings: Record<string, unknown>): AuthSettings {
  const sso = ssoConfigured();
  const forced = sso && settings.auth_sso_forced === true;
  return {
    ssoEnabled: sso,
    ssoForced: forced,
    passwordEnabled: !forced && settings.auth_password_enabled !== false,
    magicLinkEnabled: !forced && settings.auth_magic_link_enabled !== false,
  };
}

/** Options Supabase pour le SSO Azure. */
export function azureOAuthOptions(redirectTo: string) {
  const tenant = process.env.AZURE_TENANT_ID;
  return {
    provider: "azure" as const,
    options: {
      redirectTo,
      scopes: "email openid profile",
      ...(tenant ? { queryParams: { tenant } } : {}),
    },
  };
}
