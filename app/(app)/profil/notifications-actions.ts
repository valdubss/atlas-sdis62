"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(5).max(200) }),
});

/** Enregistre l'abonnement push du navigateur courant. */
export async function savePushSubscription(input: unknown, userAgent: string | null): Promise<Result> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Abonnement invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // Un appareil partagé change de main : l'abonnement (lié à l'appareil) suit le
  // compte connecté. La ligne précédente, peut-être d'un autre agent, est retirée.
  try {
    await createAdminClient().from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).neq("user_id", user.id);
  } catch {
    /* sans clé service_role : l'upsert ci-dessous échouera proprement */
  }
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, user_agent: userAgent?.slice(0, 300) ?? null },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/profil");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/profil");
  return { ok: true };
}

const prefsSchema = z.object({
  push_new_posts: z.boolean().optional(),
  push_pinned: z.boolean().optional(),
  push_center: z.boolean().optional(),
  push_agenda: z.boolean().optional(),
  push_messages: z.enum(["all", "mentions", "none"]).optional(),
  quiet_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  hide_preview: z.boolean().optional(),
  digest_email: z.boolean().optional(),
});

export async function updateNotificationPrefs(input: unknown): Promise<Result> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Valeur invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("user_settings").upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/profil");
  return { ok: true };
}
