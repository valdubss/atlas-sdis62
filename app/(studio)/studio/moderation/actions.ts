"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";

type Result = { ok: true } | { ok: false; error: string };

/** Traite un signalement : masquer le commentaire, ou le laisser en ligne (signalement rejeté). */
export async function resolveReport(reportId: string, decision: "hide" | "dismiss"): Promise<Result> {
  if (!z.uuid().safeParse(reportId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: report } = await supabase.from("comment_reports").select("id, comment_id").eq("id", reportId).maybeSingle();
  if (!report) return { ok: false, error: "Signalement introuvable." };

  if (decision === "hide") {
    const { error } = await supabase.from("comments").update({ status: "hidden" }).eq("id", report.comment_id);
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  }

  const { error } = await supabase
    .from("comment_reports")
    .update({ status: decision === "hide" ? "resolved" : "dismissed", resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };

  // Les autres signalements ouverts du même commentaire sont clos avec la même décision.
  await supabase
    .from("comment_reports")
    .update({ status: decision === "hide" ? "resolved" : "dismissed", resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("comment_id", report.comment_id)
    .eq("status", "open");

  revalidatePath("/studio/moderation");
  return { ok: true };
}

/** Rétablit ou masque un commentaire directement. */
export async function setCommentStatus(commentId: string, status: "visible" | "hidden" | "deleted"): Promise<Result> {
  if (!z.uuid().safeParse(commentId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("comments").update({ status }).eq("id", commentId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/studio/moderation");
  return { ok: true };
}

/** Active ou désactive les commentaires d'une publication. */
export async function setPostComments(postId: string, enabled: boolean): Promise<Result> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("posts").update({ comments_enabled: enabled }).eq("id", postId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/studio/moderation");
  revalidatePath("/");
  return { ok: true };
}
