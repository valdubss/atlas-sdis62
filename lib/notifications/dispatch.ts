import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, type PushPayload } from "@/lib/push/server";
import { sendMail } from "@/lib/email/transport";
import { mediaUrl } from "@/lib/media/url";
import { groupDeferred, isQuiet, nextQuietEnd, parseClock } from "./quiet";

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
    .in("kind", ["push_pinned", "push_category", "push_flash", "push_center", "push_message", "email_feedback"])
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
      admin.from("user_settings").select("user_id, push_pinned, push_new_posts, push_center, quiet_start, quiet_end"),
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
    // Messagerie : membres du canal selon leurs préférences (par conversation et globales),
    // silence, mentions ; l'aperçu est masqué pour ceux qui l'ont demandé.
    let hidePreview = new Set<string>();
    if (item.kind === "push_message") {
      const p = item.payload as unknown as { channel_id: string; author_id?: string | null; mentions?: string[]; mention_all?: boolean; admins_only?: boolean };
      const { data: members } = await admin.rpc("channel_push_targets", { p_channel: p.channel_id });
      const now = Date.now();
      const allowed = new Map<string, boolean>();
      for (const m of members ?? []) {
        if (m.user_id === p.author_id) continue;
        if (p.admins_only && !m.is_admin) continue;
        if (m.muted_until && new Date(m.muted_until).getTime() > now) continue;
        const mentioned = Boolean(p.mention_all) || (p.mentions ?? []).includes(m.user_id);
        const pref = m.push_messages === "none" || m.notifications === "none" ? "none" : m.push_messages === "mentions" || m.notifications === "mentions" ? "mentions" : "all";
        if (pref === "none" || (pref === "mentions" && !mentioned)) continue;
        allowed.set(m.user_id, m.hide_preview);
      }
      hidePreview = new Set([...allowed.entries()].filter(([, h]) => h).map(([id]) => id));
      targets = (subs ?? []).filter((s) => allowed.has(s.user_id));
    }
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

    const payload: PushPayload = { title: item.payload.title, body: item.payload.body, url: item.payload.url, tag: item.payload.post_id ?? (item.payload as { flash_id?: string; channel_id?: string }).flash_id ?? (item.payload as { channel_id?: string }).channel_id, urgent: item.kind === "push_flash" };
    const discreet: PushPayload = { ...payload, body: "Nouveau message" };

    // Plage de silence (par agent, heure de Paris) : les pushs non urgentes sont
    // mises en attente et regroupées à la fin de la plage. Les flashs passent toujours.
    if (item.kind !== "push_flash") {
      const now = new Date();
      const quietOf = new Map((settings ?? []).map((s) => [s.user_id, s] as const));
      const deferredUsers = new Set<string>();
      for (const s of targets) {
        if (deferredUsers.has(s.user_id)) continue;
        const pref = quietOf.get(s.user_id);
        const start = parseClock(pref?.quiet_start, { h: 21, m: 0 });
        const end = parseClock(pref?.quiet_end, { h: 7, m: 0 });
        if (isQuiet(now, start, end)) deferredUsers.add(s.user_id);
      }
      if (deferredUsers.size > 0) {
        await admin.from("notification_deferred").insert(
          [...deferredUsers].map((user_id) => {
            const pref = quietOf.get(user_id);
            return { user_id, kind: item.kind, payload: { title: payload.title, body: payload.body, url: payload.url, tag: payload.tag ?? null }, deliver_after: nextQuietEnd(now, parseClock(pref?.quiet_end, { h: 7, m: 0 })).toISOString() };
          }),
        );
        targets = targets.filter((s) => !deferredUsers.has(s.user_id));
      }
    }
    const gone: string[] = [];
    let ok = 0;
    let failed = 0;
    let lastError: string | null = null;
    // Envois par lots de 50 : pas de rafale de milliers de connexions simultanées
    for (let i = 0; i < targets.length; i += 50) {
      await Promise.all(
        targets.slice(i, i + 50).map(async (s) => {
          const r = await sendPush(s, hidePreview.has(s.user_id) ? discreet : payload);
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
        sent_count: ok,
      })
      .eq("id", item.id);
  }
  const flushed = await flushDeferred().catch((e) => {
    console.error("différées", e);
    return 0;
  });
  return { processed: (queue ?? []).length, sent: sent + flushed, removed };
}

/**
 * Fin de plage de silence : envoie à chaque agent concerné une seule push
 * (« 3 nouveautés cette nuit ») regroupant celles mises en attente.
 */
export async function flushDeferred(): Promise<number> {
  const admin = createAdminClient();
  const { data: due } = await admin.from("notification_deferred").select("id, user_id, kind, payload").lte("deliver_after", new Date().toISOString()).order("created_at").limit(2000);
  if (!due || due.length === 0) return 0;
  const byUser = new Map<string, typeof due>();
  for (const d of due) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d]);
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id").in("user_id", [...byUser.keys()]);
  let sent = 0;
  const gone: string[] = [];
  for (const [userId, items] of byUser) {
    const grouped = groupDeferred(items.map((i) => i.payload as { title: string; body: string; url: string }));
    if (!grouped) continue;
    const payload: PushPayload = { ...grouped, tag: items.length === 1 ? ((items[0].payload as { tag?: string }).tag ?? undefined) : "atlas-night" };
    for (const s of (subs ?? []).filter((x) => x.user_id === userId)) {
      const r = await sendPush(s, payload);
      if (r.status === "sent") sent++;
      else if (r.status === "gone") gone.push(s.id);
    }
  }
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  await admin.from("notification_deferred").delete().in("id", due.map((d) => d.id));
  return sent;
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
  // Messagerie : rappel 48 h avant la fin d'un groupe, archivage à l'échéance, purge > 24 mois
  const { data: messaging, error: messagingError } = await admin.rpc("messaging_maintenance");
  if (messagingError) console.error("entretien messagerie", messagingError.message);
  const messagingKeys = ((messaging as { keys?: string[] } | null)?.keys ?? []).filter(Boolean);
  const { data: orphans } = await admin.rpc("purge_orphan_media");
  const keys = [...((orphans ?? []) as { id: string; keys: string[] }[]).flatMap((o) => o.keys ?? []), ...messagingKeys];
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
