/**
 * Restriction des connexions aux domaines e-mail autorisés.
 *
 * Deux niveaux de contrôle :
 *  1. ici, côté serveur Next (message immédiat à l'utilisateur) ;
 *  2. en base, trigger handle_new_user() qui lit app_settings.allowed_email_domains
 *     (défense en profondeur : même un appel direct à l'API Supabase est refusé).
 *
 * Gardez ALLOWED_EMAIL_DOMAINS (.env) et app_settings.allowed_email_domains alignés.
 */
export function getAllowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string, domains = getAllowedDomains()) {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (domains.length === 0) return false;
  return domains.includes(domain);
}
