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
  const { data: candidates } = await admin
    .from("notification_queue")
    .select("id")
    .eq("status", "pending")
    .in("kind", ["push_pinned", "push_category", "push_flash", "push_center", "email_feedback"])
    .order("created_at")
    .limit(limit);
  if (!candidates || candidates.length === 0) return { processed: 0, sent: 0, removed: 0 };

  // Réservation : deux distributeurs concurrents (after() + cron) ne traitent
  // jamais la même entrée.
  const { data: queue } = await admin
    .from("notification_queue")
    .update({ status: "processing" })
    .eq("status", "pending")
    .in(
      "id",
      candidates.map((c) => c.id),
    )
    .select("id, kind, payload, attempts");

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
    // Destinataires : tous les abonnements, filtrés par la préférence de leur
    // propriétaire (user_settings est lu séparément : pas de relation directe
    // entre les deux tables pour PostgREST).
    // Flash : tous les abonnés, quelles que soient leurs préférences
    const prefColumn = item.kind === "push_pinned" ? "push_pinned" : item.kind === "push_flash" ? null : "push_new_posts";
    const [{ data: subs, error: subsError }, { data: settings }] = await Promise.all([
      admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id").limit(5000),
      admin.from("user_settings").select("user_id, push_pinned, push_new_posts, push_center"),
    ]);
    if (subsError) {
      console.error("dispatch: abonnements illisibles", subsError.message);
      await admin
        .from("notification_queue")
        .update({ status: item.attempts + 1 >= 3 ? "failed" : "pending", attempts: item.attempts + 1, error: subsError.message.slice(0, 300) })
        .eq("id", item.id);
      continue;
    }
    const optOut = new Set(prefColumn ? (settings ?? []).filter((s) => s[prefColumn] === false).map((s) => s.user_id) : []);
    let targets = (subs ?? []).filter((s) => !optOut.has(s.user_id));
    if (item.kind === "push_center") {
      // Contenu de centre : agents rattachés au centre (préférence push_center), ou un seul destinataire (refus / validation)
      const p = item.payload as unknown as { center_id?: string; user_id?: string };
      if (p.user_id) targets = (subs ?? []).filter((s) => s.user_id === p.user_id);
      else if (p.center_id) {
        const { data: members } = await admin.from("profiles").select("id").eq("center_id", p.center_id).eq("is_active", true);
        const ids = new Set((members ?? []).map((m) => m.id));
        const off = new Set((settings ?? []).filter((s) => s.push_center === false).map((s) => s.user_id));
        targets = (subs ?? []).filter((s) => ids.has(s.user_id) && !off.has(s.user_id));
      } else targets = [];
    }

    const payload: PushPayload = { title: item.payload.title, body: item.payload.body, url: item.payload.url, tag: item.payload.post_id ?? (item.payload as { flash_id?: string }).flash_id, urgent: item.kind === "push_flash" };
    const gone: string[] = [];
    let ok = 0;
    let failed = 0;
    let lastError: string | null = null;
    // Envois par lots de 50 : pas de rafale de milliers de connexions simultanées
    for (let i = 0; i < targets.length; i += 50) {
      await Promise.all(
        targets.slice(i, i + 50).map(async (s) => {
          const r = await sendPush(s, payload);
          if (r.status === "sent") ok++;
          else if (r.status === "gone") gone.push(s.id);
          else {
            failed++;
            lastError = r.message;
          }
        }),
      );
    }
    if (gone.length) {
      await admin.from("push_subscriptions").delete().in("id", gone);
      removed += gone.length;
    }
    sent += ok;
    const summary = `${ok}/${targets.length} envoyés` + (gone.length ? `, ${gone.length} expirés` : "") + (failed ? `, ${failed} en erreur (${lastError})` : "");
    const allFailed = targets.length > 0 && ok === 0 && failed > 0;
    await admin
      .from("notification_queue")
      .update({
        status: allFailed ? (item.attempts + 1 >= 3 ? "failed" : "pending") : "sent",
        sent_at: allFailed ? null : new Date().toISOString(),
        attempts: item.attempts + 1,
        error: failed ? summary : null,
        stats: summary,
      })
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

/**
 * Entretien quotidien (cron) : entrées bloquées en « processing » remises en
 * attente, purge des compteurs de limitation, de la file traitée et des médias
 * orphelins (lignes supprimées en base, fichiers effacés du stockage).
 */
export async function runMaintenance(): Promise<{ requeued: number; orphanMedia: number }> {
  const admin = createAdminClient();
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: requeued } = await admin
    .from("notification_queue")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("created_at", stale)
    .select("id");
  await admin.rpc("purge_rate_limit_events");
  await admin.rpc("purge_notification_queue");
  await admin.rpc("purge_notifications");
  await admin.rpc("purge_page_views").then(({ error }) => error && console.error("purge consultations", error.message));
  // Vidéos : jobs en attente ou bloqués (> 10 min), 3 tentatives, un média par passage
  const { data: pendingVideo } = await admin
    .from("media")
    .select("id")
    .eq("kind", "video")
    .in("video_status", ["uploaded", "processing"])
    .lt("transcode_attempts", 3)
    .lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .order("updated_at", { ascending: true })
    .limit(1);
  if (pendingVideo?.[0]) {
    const { getVideoProvider } = await import("@/lib/video/provider");
    await (await getVideoProvider()).run(pendingVideo[0].id, 40_000).catch((e) => console.error("transcodage", e));
  }
  // Rappels d'événements de demain (notification dans l'app, pas de push)
  await admin.rpc("notify_events_tomorrow").then(({ error }) => error && console.error("rappels agenda", error.message));
  const { data: orphans } = await admin.rpc("purge_orphan_media");
  const keys = ((orphans ?? []) as { id: string; keys: string[] }[]).flatMap((o) => o.keys ?? []);
  if (keys.length > 0) {
    const { getStorage } = await import("@/lib/storage");
    for (let i = 0; i < keys.length; i += 100) {
      await getStorage()
        .deleteObjects(keys.slice(i, i + 100))
        .catch((e) => console.error("purge médias", e));
    }
  }
  return { requeued: requeued?.length ?? 0, orphanMedia: (orphans ?? []).length };
}
