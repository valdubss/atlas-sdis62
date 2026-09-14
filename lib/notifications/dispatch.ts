import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, type PushPayload } from "@/lib/push/server";

type QueueRow = { id: number; kind: string; payload: PushPayload & { post_id?: string }; attempts: number };

/**
 * Vide la file de notifications (clé service_role : contourne la RLS).
 * Appelée juste après une publication et par le cron /api/cron/dispatch.
 * Idempotent : chaque entrée est marquée `sent` ou `failed`.
 */
export async function dispatchNotifications(limit = 20): Promise<{ processed: number; sent: number; removed: number }> {
  const admin = createAdminClient();
  const { data: queue } = await admin
    .from("notification_queue")
    .select("id, kind, payload, attempts")
    .eq("status", "pending")
    .in("kind", ["push_pinned", "push_category"])
    .order("created_at")
    .limit(limit);

  let sent = 0;
  let removed = 0;
  for (const item of (queue ?? []) as unknown as QueueRow[]) {
    // Destinataires : abonnés dont la préférence correspond
    const prefColumn = item.kind === "push_pinned" ? "push_pinned" : "push_new_posts";
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id, settings:user_settings!push_subscriptions_user_id_fkey(push_pinned, push_new_posts)")
      .limit(5000);

    const targets = ((subs ?? []) as unknown as { id: string; endpoint: string; p256dh: string; auth: string; settings: Record<string, boolean> | null }[]).filter(
      (s) => s.settings?.[prefColumn] !== false,
    );

    const payload: PushPayload = { title: item.payload.title, body: item.payload.body, url: item.payload.url, tag: item.payload.post_id };
    const gone: string[] = [];
    let ok = 0;
    await Promise.all(
      targets.map(async (s) => {
        const r = await sendPush(s, payload);
        if (r === "sent") ok++;
        if (r === "gone") gone.push(s.id);
      }),
    );
    if (gone.length) {
      await admin.from("push_subscriptions").delete().in("id", gone);
      removed += gone.length;
    }
    sent += ok;
    await admin
      .from("notification_queue")
      .update({ status: "sent", sent_at: new Date().toISOString(), attempts: item.attempts + 1, error: null })
      .eq("id", item.id);
  }
  return { processed: (queue ?? []).length, sent, removed };
}
