import "server-only";

import { sendMail } from "@/lib/email/transport";
import { APP_NAME } from "@/lib/config";
import { siteUrl } from "@/lib/email/site";
import { escapeHtml, layout } from "@/lib/email/layout";

export type MembershipRequestInfo = {
  id: string;
  token: string;
  recipient_email: string | null;
  target_name: string;
  target_kind: "center" | "service";
  requester_name: string;
  requester_email: string;
};

/**
 * E-mail au chef de centre (ou responsable com, ou service communication) :
 * « X demande à rejoindre le CIS Y », avec deux boutons. Les liens ouvrent une
 * page de confirmation : rien n'est décidé par la simple ouverture du lien
 * (les passerelles de messagerie ouvrent parfois les liens d'elles-mêmes).
 */
export async function sendMembershipRequestEmail(info: MembershipRequestInfo): Promise<boolean> {
  if (!info.recipient_email) return false;
  const base = siteUrl();
  const accept = `${base}/rattachement/${info.token}?decision=accepter`;
  const decline = `${base}/rattachement/${info.token}?decision=refuser`;
  const kind = info.target_kind === "center" ? "le centre" : "le service";
  const text = `${info.requester_name} (${info.requester_email}) demande à rejoindre ${info.target_name} sur ${APP_NAME}.\n\nAccepter : ${accept}\nRefuser : ${decline}\n\nSans réponse sous sept jours, la demande expire. Si vous n'êtes pas la bonne personne, transmettez cet e-mail au chef de centre.`;
  const html = layout({
    title: `${escapeHtml(info.requester_name)} demande à rejoindre ${escapeHtml(info.target_name)}`,
    intro: `${escapeHtml(info.requester_name)} (${escapeHtml(info.requester_email)}) a choisi ${kind} <strong>${escapeHtml(info.target_name)}</strong> comme rattachement sur ${APP_NAME}. Une fois accepté, il verra la page du centre, ses événements et ses actualités.`,
    buttons: [
      { label: "Accepter", href: accept },
      { label: "Refuser", href: decline, tone: "secondary" },
    ],
    footer: "Sans réponse sous sept jours, la demande expire. Si vous n'êtes pas la bonne personne, transmettez cet e-mail au chef de centre ou au service communication.",
  });
  return sendMail({ to: info.recipient_email, subject: `${APP_NAME} · ${info.requester_name} demande à rejoindre ${info.target_name}`, html, text });
}

/** E-mail à l'agent une fois la décision prise (en plus de la notification dans l'app). */
export async function sendMembershipDecisionEmail(to: string, requesterName: string, targetName: string, accepted: boolean, note?: string | null): Promise<boolean> {
  const base = siteUrl();
  const title = accepted ? `Bienvenue à ${escapeHtml(targetName)}` : `Rattachement à ${escapeHtml(targetName)} refusé`;
  const intro = accepted
    ? `Bonjour ${escapeHtml(requesterName)}, votre rattachement a été accepté. La page du centre est maintenant votre onglet « Mon centre ».`
    : `Bonjour ${escapeHtml(requesterName)}, votre demande n'a pas été acceptée.${note ? " Motif : " + escapeHtml(note) : ""} Vous pouvez choisir un autre rattachement depuis votre profil, ou vous rapprocher de votre chef de centre.`;
  const text = `${title}\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${base}/centre`;
  return sendMail({ to, subject: `${APP_NAME} · ${accepted ? "rattachement accepté" : "rattachement refusé"}`, html: layout({ title, intro, buttons: [{ label: "Ouvrir ATLAS", href: `${base}/centre` }] }), text });
}
