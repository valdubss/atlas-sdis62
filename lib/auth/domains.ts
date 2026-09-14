/**
 * Restriction des connexions aux adresses autorisées.
 *
 * Deux listes :
 *  - ALLOWED_EMAIL_DOMAINS : domaines entiers (ex. sdis62.fr) ;
 *  - ALLOWED_EMAILS : adresses individuelles hors domaine (ex. un administrateur
 *    externe). Le reste du domaine de ces adresses reste refusé.
 *
 * Deux niveaux de contrôle :
 *  1. ici, côté serveur Next (message immédiat à l'utilisateur) ;
 *  2. en base, trigger handle_new_user() qui lit app_settings.allowed_email_domains
 *     et app_settings.allowed_emails (défense en profondeur).
 *
 * Gardez .env et app_settings alignés.
 */
function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedDomains(): string[] {
  return parseList(process.env.ALLOWED_EMAIL_DOMAINS);
}

export function getAllowedEmails(): string[] {
  return parseList(process.env.ALLOWED_EMAILS);
}

export function isAllowedEmail(
  email: string,
  domains = getAllowedDomains(),
  emails = getAllowedEmails(),
) {
  const normalized = email.trim().toLowerCase();
  if (emails.includes(normalized)) return true;
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  return domains.includes(normalized.slice(at + 1));
}
