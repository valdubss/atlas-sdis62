import "server-only";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendMembershipRequestEmail, type MembershipRequestInfo } from "./email";

export type RequestResult = { ok: true; targetName: string; recipient: string | null; emailSent: boolean } | { ok: false; error: string };

/**
 * Demande de rattachement de l'agent connecté : la fonction SQL crée la demande
 * (et annule la précédente), puis l'e-mail part au chef de centre, au
 * responsable com ou au service communication selon ce qui est renseigné.
 */
export async function requestMembership(target: { center_id?: string | null; service_id?: string | null }): Promise<RequestResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_membership", { p_center: target.center_id ?? null, p_service: target.service_id ?? null });
  if (error) {
    const m = error.message;
    if (m.includes("DEJA_RATTACHE")) return { ok: false, error: "Vous êtes déjà rattaché à ce centre." };
    if (m.includes("INTROUVABLE")) return { ok: false, error: "Ce centre n'existe plus." };
    return { ok: false, error: "Demande impossible pour le moment. Réessayez." };
  }
  const info = data as unknown as MembershipRequestInfo;
  // L'e-mail part après la réponse : l'écran ne bloque pas sur le SMTP
  after(async () => {
    try {
      await sendMembershipRequestEmail(info);
    } catch (e) {
      console.error("e-mail de rattachement", e);
    }
  });
  return { ok: true, targetName: info.target_name, recipient: info.recipient_email, emailSent: Boolean(info.recipient_email) };
}

export type PendingRequest = { id: string; status: string; requested_at: string; expires_at: string; recipient_email: string | null; center: { id: string; name: string; slug: string } | null; service: { id: string; name: string; slug: string } | null };

/** Demande en attente de l'agent connecté, s'il y en a une. */
export async function fetchMyPendingRequest(profileId: string): Promise<PendingRequest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("membership_requests")
    .select("id, status, requested_at, expires_at, recipient_email, center:centers!membership_requests_center_id_fkey(id, name, slug), service:services!membership_requests_service_id_fkey(id, name, slug)")
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .maybeSingle();
  return (data as unknown as PendingRequest | null) ?? null;
}

export type CenterRequest = { id: string; requested_at: string; expires_at: string; profile: { id: string; first_name: string; last_name: string; avatar_key: string | null; job_title: string | null } | null };

/** Demandes en attente pour un centre (chef, responsable com, service communication). */
export async function fetchCenterRequests(centerId: string): Promise<CenterRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("membership_requests")
    .select("id, requested_at, expires_at, profile:profiles!membership_requests_profile_id_fkey(id, first_name, last_name, avatar_key, job_title)")
    .eq("center_id", centerId)
    .eq("status", "pending")
    .order("requested_at");
  return (data ?? []) as unknown as CenterRequest[];
}
