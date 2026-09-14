import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, type PushPayload } from "@/lib/push/server";
import { sendMail } from "@/lib/email/transport";
import { mediaUrl } from "@/lib/media/url";

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
    .in("kind", ["push_pinned", "push_category", "email_feedback"])
    .order("created_at")
    .limit(limit);

  let sent = 0;
  let removed = 0;
  for (const item of (queue ?? []) as unknown as QueueRow[]) {
    if (item.kind === "email_feedback") {
      const ok = await sendFeedbackEmail(admin, (item.payload as unknown as { feedback_id: string }).feedback_id);
      if (ok) sent++;
      await admin
        .from("notification_queue")
        .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null, attempts: item.attempts + 1, error: ok ? null : "envoi e-mail impossible" })
        .eq("id", item.id);
      continue;
    }
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

/** E-mail au service communication pour un signalement (adresse app_settings.feedback_email). */
async function sendFeedbackEmail(admin: ReturnType<typeof createAdminClient>, feedbackId: string): Promise<boolean> {
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "feedback_email").maybeSingle();
  const to = typeof setting?.value === "string" ? setting.value : null;
  if (!to) return false;
  const { data: fb } = await admin
    .from("feedback")
    .select("id, category, description, screenshot_key, context, created_at, author:profiles!feedback_user_id_fkey(first_name, last_name, email)")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!fb) return false;
  const f = fb as unknown as { category: string; description: string; screenshot_key: string | null; context: Record<string, string>; created_at: string; author: { first_name: string; last_name: string; email: string } | null };
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const cat = { bug: "Problème technique", content: "Contenu", suggestion: "Suggestion" }[f.category] ?? f.category;
  const who = f.author ? `${f.author.first_name} ${f.author.last_name}`.trim() + ` (${f.author.email})` : "agent inconnu";
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const lines = [`Catégorie : ${cat}`, `De : ${who}`, `Page : ${f.context.path ?? "-"}`, `Navigateur : ${f.context.user_agent ?? "-"}`, `Écran : ${f.context.viewport ?? "-"}`, `Version : ${f.context.app_version ?? "-"}`];
  const text = `Nouveau signalement ATLAS\n\n${f.description}\n\n${lines.join("\n")}\n\n${f.screenshot_key ? "Capture : " + mediaUrl(f.screenshot_key) + "\n" : ""}Traiter : ${site}/studio/retours`;
  const html = `<div style="font-family:Inter,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c1c21"><p style="font-size:13px;color:#6e6e73;margin:0 0 6px">ATLAS · ${esc(cat)}</p><p style="font-size:16px;white-space:pre-line;margin:0 0 16px">${esc(f.description)}</p><p style="font-size:13px;color:#6e6e73;margin:0 0 16px">${lines.map(esc).join("<br>")}</p>${f.screenshot_key ? `<p><a href="${mediaUrl(f.screenshot_key)}">Voir la capture d'écran</a></p>` : ""}<p><a href="${site}/studio/retours" style="color:#d71f36;font-weight:600">Traiter dans le studio</a></p></div>`;
  return sendMail({ to, subject: `[ATLAS] ${cat} signalé par ${f.author ? f.author.first_name + " " + f.author.last_name : "un agent"}`, html, text });
}
