"use server";

import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { feedbackSchema } from "@/lib/validation/feedback";
import { friendlyDbError } from "@/lib/validation/comment";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

export type FeedbackState = { status: "idle" } | { status: "sent" } | { status: "error"; message: string; fields?: Record<string, string> };

export async function submitFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const parsed = feedbackSchema.safeParse({
    category: formData.get("category"),
    description: formData.get("description") ?? "",
    screenshot_id: formData.get("screenshot_id") ?? "",
    context: {
      path: formData.get("ctx_path") ?? "/",
      user_agent: formData.get("ctx_ua") ?? "",
      viewport: formData.get("ctx_viewport") ?? "",
      app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "",
    },
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "");
      if (k && !fields[k]) fields[k] = i.message;
    }
    return { status: "error", message: "Vérifiez les champs.", fields };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Session expirée." };

  let screenshotKey: string | null = null;
  if (v.screenshot_id) {
    const { data: media } = await supabase.from("media").select("original_key, variants, status, owner_id").eq("id", v.screenshot_id).maybeSingle();
    if (media && media.owner_id === user.id && media.status === "ready") {
      const variants = (media.variants ?? {}) as { medium?: string };
      screenshotKey = variants.medium ?? media.original_key;
    }
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    category: v.category,
    description: v.description,
    screenshot_key: screenshotKey,
    context: v.context,
  });
  if (error) return { status: "error", message: friendlyDbError(error.message) };

  after(async () => {
    try {
      await dispatchNotifications(20);
    } catch (e) {
      console.error("dispatch feedback", e);
    }
  });
  return { status: "sent" };
}

export async function setFeedbackStatus(id: string, status: "new" | "seen" | "done"): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase
    .from("feedback")
    .update({ status, handled_by: status === "new" ? null : user.id, handled_at: status === "new" ? null : new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}
