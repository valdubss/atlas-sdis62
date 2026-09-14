import "server-only";

import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; html: string; text: string };

/**
 * Envoi d'e-mail : Resend si RESEND_API_KEY est défini, sinon SMTP (SMTP_HOST…).
 * Renvoie false si aucun transport n'est configuré.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const from = process.env.EMAIL_FROM ?? "ATLAS <noreply@example.org>";

  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) {
      console.error("resend", res.status, await res.text());
      return false;
    }
    return true;
  }

  if (process.env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({ from, ...mail });
    return true;
  }

  console.warn("Aucun transport e-mail configuré (RESEND_API_KEY ou SMTP_HOST).");
  return false;
}
