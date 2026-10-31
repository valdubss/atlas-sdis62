/** Constantes de la première connexion partagées avec le navigateur (pas de code serveur ici). */
export const TEMP_PASSWORD_DAYS_PUBLIC = 7;

/** Statuts d'agent proposés à l'accueil. */
export const AGENT_STATUSES = [
  { value: "spv", label: "SPV", description: "Sapeur-pompier volontaire" },
  { value: "spp", label: "SPP", description: "Sapeur-pompier professionnel" },
  { value: "jsp", label: "JSP", description: "Jeune sapeur-pompier" },
  { value: "pats", label: "PATS", description: "Personnel administratif, technique et spécialisé" },
] as const;
export type AgentStatusValue = (typeof AGENT_STATUSES)[number]["value"];
export const AGENT_STATUS_LABELS: Record<AgentStatusValue, string> = { spv: "SPV", spp: "SPP", jsp: "JSP", pats: "PATS" };

/** Forme canonique d'un matricule : majuscules, sans espaces, points ni tirets. */
export function normalizeMatricule(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-]/g, "");
}
export const MATRICULE_RE = /^[A-Z0-9]{3,12}$/;
