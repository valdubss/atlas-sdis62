import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/transport";
import { APP_NAME } from "@/lib/config";
import { siteUrl } from "@/lib/email/site";
import { escapeHtml, layout } from "@/lib/email/layout";

/** E-mail « vous êtes co-rédacteur » (en plus de la notification dans l'app). */
export async function sendCoeditorEmail(postId: string, profileId: string, by: { first_name: string; last_name: string; email: string }): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: post }] = await Promise.all([
    admin.from("profiles").select("email, first_name").eq("id", profileId).maybeSingle(),
    admin.from("posts").select("title, type").eq("id", postId).maybeSingle(),
  ]);
  if (!profile?.email) return false;
  const title = post?.title?.trim() || "Publication sans titre";
  const who = `${by.first_name} ${by.last_name}`.trim() || by.email;
  const url = `${siteUrl()}/studio/posts/${postId}`;
  const text = `${who} vous a ajouté comme co-rédacteur de « ${title} » sur ${APP_NAME}.\n\nVous pouvez modifier le texte et les médias ; la publication reste du ressort du service communication.\n\nOuvrir : ${url}`;
  const html = layout({
    title: `Vous êtes co-rédacteur : ${escapeHtml(title)}`,
    intro: `${escapeHtml(who)} vous a ajouté comme co-rédacteur. Vous pouvez modifier le texte et les médias ; la mise en ligne reste du ressort du service communication.`,
    buttons: [{ label: "Ouvrir la publication", href: url }],
  });
  return sendMail({ to: profile.email, subject: `${APP_NAME} · co-rédaction : ${title}`, html, text });
}
