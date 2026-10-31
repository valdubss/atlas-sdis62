/** Constantes de la première connexion partagées avec le navigateur (pas de code serveur ici). */

/** Statuts d'agent proposés à l'accueil (« pats » reste accepté en base pour les listes importées). */
export const AGENT_STATUSES = [
  { value: "spv", label: "SPV", description: "Sapeur-pompier volontaire" },
  { value: "spp", label: "SPP", description: "Sapeur-pompier professionnel" },
  { value: "jsp", label: "JSP", description: "Jeune sapeur-pompier" },
] as const;
export type AgentStatusValue = (typeof AGENT_STATUSES)[number]["value"] | "pats";
export const AGENT_STATUS_LABELS: Record<AgentStatusValue, string> = { spv: "SPV", spp: "SPP", jsp: "JSP", pats: "PATS" };

/** Forme canonique d'un matricule : majuscules, sans espaces, points ni tirets. */
export function normalizeMatricule(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-]/g, "");
}
export const MATRICULE_RE = /^[A-Z0-9]{3,12}$/;

/** Adresse masquée pour l'affichage (« ma***@gmail.com ») : ne révèle pas l'adresse d'un autre. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***@${email.slice(at + 1)}`;
}
