import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "./transport";
import { APP_NAME } from "@/lib/config";

type DigestPost = { id: string; slug: string; title: string | null; body: string | null; type: string; published_at: string };

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Construit le digest des 7 derniers jours (HTML sobre, lisible partout). */
export function renderDigest(posts: DigestPost[], siteUrl: string) {
  const items = posts.map((p) => {
    const title = p.title ?? (p.body ?? "").slice(0, 80);
    const excerpt = (p.body ?? "").replace(/\s+/g, " ").slice(0, 160);
    const url = `${siteUrl}/post/${p.slug}`;
    return { title, excerpt, url };
  });
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f5f7;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#1c1c21">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="font-size:13px;color:#6e6e73;margin:0 0 8px">${APP_NAME} · SDIS 62</p>
    <h1 style="font-size:22px;margin:0 0 20px;letter-spacing:-0.02em">Cette semaine</h1>
    ${items
      .map(
        (i) => `<div style="background:#fff;border-radius:16px;padding:16px 18px;margin-bottom:12px">
      <p style="margin:0 0 6px;font-size:16px;font-weight:600"><a href="${i.url}" style="color:#1c1c21;text-decoration:none">${escape(i.title)}</a></p>
      <p style="margin:0 0 8px;font-size:14px;color:#6e6e73">${escape(i.excerpt)}</p>
      <a href="${i.url}" style="font-size:14px;color:#d71f36;text-decoration:none;font-weight:600">Lire</a>
    </div>`,
      )
      .join("")}
    <p style="font-size:12px;color:#6e6e73;margin-top:24px">Vous recevez ce résumé hebdomadaire car il est activé sur votre profil ${APP_NAME}. <a href="${siteUrl}/profil" style="color:#6e6e73">Gérer mes notifications</a></p>
  </div></body></html>`;
  const text = `${APP_NAME} — cette semaine\n\n` + items.map((i) => `${i.title}\n${i.excerpt}\n${i.url}\n`).join("\n");
  return { html, text };
}

/** Envoie le digest à tous les agents actifs ayant gardé l'option (ou à un seul destinataire de test). */
export async function sendWeeklyDigest(opts: { testRecipient?: string } = {}): Promise<{ posts: number; recipients: number; sent: number }> {
  const admin = createAdminClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const { data: settings } = await admin.from("app_settings").select("key, value").in("key", ["digest_enabled"]);
  const enabled = settings?.find((s) => s.key === "digest_enabled")?.value === true;
  if (!enabled && !opts.testRecipient) return { posts: 0, recipients: 0, sent: 0 };

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: posts } = await admin
    .from("posts")
    .select("id, slug, title, body, type, published_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(20);
  if (!posts || posts.length === 0) return { posts: 0, recipients: 0, sent: 0 };

  const { html, text } = renderDigest(posts as DigestPost[], siteUrl);
  const subject = `${APP_NAME} — ${posts.length} ${posts.length > 1 ? "actualités" : "actualité"} cette semaine`;

  let recipients: string[];
  if (opts.testRecipient) recipients = [opts.testRecipient];
  else {
    const { data: rows } = await admin
      .from("profiles")
      .select("email, settings:user_settings!user_settings_user_id_fkey(digest_email)")
      .eq("is_active", true)
      .limit(5000);
    recipients = ((rows ?? []) as unknown as { email: string; settings: { digest_email: boolean } | null }[]).filter((r) => r.settings?.digest_email !== false).map((r) => r.email);
  }

  let sent = 0;
  for (const to of recipients) {
    if (await sendMail({ to, subject, html, text })) sent++;
  }
  return { posts: posts.length, recipients: recipients.length, sent };
}
