/**
 * Point d'extension pour l'authentification.
 *
 * Aujourd'hui : lien magique par e-mail (Supabase Auth, provider "email").
 * Demain : SSO Azure AD / OIDC. Supabase le gère nativement : il suffira
 *  1. d'activer le provider dans le dashboard Supabase (Authentication → Providers),
 *  2. de renseigner AUTH_OIDC_PROVIDER=azure (et le tenant) dans .env,
 *  3. la page de connexion affichera automatiquement le bouton SSO.
 * Le schéma SQL et la RLS ne changent pas : le trigger handle_new_user()
 * s'applique quel que soit le provider.
 */

export type AuthProviderId = "magic_link" | "azure";

export type AuthProvider = {
  id: AuthProviderId;
  label: string;
  enabled: boolean;
};

export function getAuthProviders(): AuthProvider[] {
  const oidc = process.env.AUTH_OIDC_PROVIDER;
  return [
    { id: "magic_link", label: "Lien de connexion par e-mail", enabled: true },
    {
      id: "azure",
      label: "Connexion SSO (Microsoft)",
      enabled: oidc === "azure",
    },
  ];
}

/** Paramètres à passer à supabase.auth.signInWithOAuth pour le SSO Azure. */
export function getAzureOAuthOptions(redirectTo: string) {
  const tenant = process.env.AUTH_OIDC_TENANT;
  return {
    provider: "azure" as const,
    options: {
      redirectTo,
      scopes: "email openid profile",
      queryParams: tenant ? { tenant } : undefined,
    },
  };
}
