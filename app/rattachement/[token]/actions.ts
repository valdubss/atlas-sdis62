"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMembershipDecisionEmail } from "@/lib/membership/email";

export type DecisionState = { status: "idle" } | { status: "done"; accepted: boolean; requesterName: string; targetName: string } | { status: "error"; message: string };

const schema = z.object({
  token: z.string().regex(/^[0-9a-f]{48}$/),
  decision: z.enum(["accepter", "refuser"]),
  note: z.string().trim().max(400).optional().default(""),
});

/**
 * Décision depuis le lien e-mail (sans compte) : le jeton signe la demande.
 * Le serveur appelle la fonction SQL avec la clé service_role ; un jeton
 * inconnu, déjà utilisé ou expiré renvoie un message clair.
 */
export async function decideByToken(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const parsed = schema.safeParse({ token: formData.get("token"), decision: formData.get("decision"), note: formData.get("note") ?? "" });
  if (!parsed.success) return { status: "error", message: "Lien invalide." };
  const { token, decision, note } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("decide_membership_by_token", { p_token: token, p_accept: decision === "accepter", p_note: note || null });
  if (error) return { status: "error", message: "Décision impossible pour le moment. Réessayez." };
  const r = data as { ok: boolean; reason?: string; status?: string; requester_name?: string; requester_email?: string; target_name?: string };
  if (!r.ok) {
    const reasons: Record<string, string> = {
      introuvable: "Ce lien ne correspond à aucune demande.",
      expired: "Cette demande a expiré (sept jours sans réponse). L'agent peut la renouveler depuis son profil.",
      accepted: "Cette demande a déjà été acceptée.",
      declined: "Cette demande a déjà été refusée.",
      cancelled: "L'agent a retiré sa demande.",
    };
    return { status: "error", message: reasons[r.reason ?? ""] ?? "Cette demande n'est plus en attente." };
  }
  if (r.requester_email) {
    sendMembershipDecisionEmail(r.requester_email, r.requester_name ?? "", r.target_name ?? "", decision === "accepter", note || null).catch(() => {});
  }
  return { status: "done", accepted: decision === "accepter", requesterName: r.requester_name ?? "", targetName: r.target_name ?? "" };
}
