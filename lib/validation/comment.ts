import { z } from "zod";
import { LIMITS } from "@/lib/config";

export const commentSchema = z.object({
  post_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  body: z
    .string()
    .trim()
    .min(1, "Écrivez un commentaire.")
    .max(LIMITS.commentMaxLength, `${LIMITS.commentMaxLength} caractères maximum.`),
});

export const reportSchema = z.object({
  comment_id: z.uuid(),
  reason: z.string().trim().min(3, "Précisez la raison.").max(500),
});

/** Traduit les erreurs Postgres levées par les triggers en message lisible. */
export function friendlyDbError(message: string | undefined): string {
  if (!message) return "Une erreur est survenue.";
  if (message.includes("LIMITE_ATTEINTE")) return "Doucement ! Réessayez dans quelques minutes.";
  if (message.includes("COMMENTAIRES_DESACTIVES")) return "Les commentaires sont désactivés sur cette publication.";
  if (message.includes("UN_SEUL_NIVEAU")) return "Impossible de répondre à une réponse.";
  if (message.includes("LIMITE_EPINGLES")) return "3 publications épinglées maximum : désépinglez-en une d'abord.";
  if (message.includes("row-level security")) return "Action non autorisée.";
  return "Une erreur est survenue. Réessayez.";
}
