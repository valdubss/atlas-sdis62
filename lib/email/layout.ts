import "server-only";

import { APP_NAME } from "@/lib/config";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * Gabarit e-mail sobre (texte foncé sur blanc, un ou deux boutons), lisible
 * dans tous les clients. Le texte brut est fourni séparément par l'appelant.
 */
export function layout({ title, intro, buttons = [], footer, code }: { title: string; intro: string; buttons?: { label: string; href: string; tone?: "primary" | "secondary" }[]; footer?: string; code?: string }): string {
  const btn = (b: { label: string; href: string; tone?: "primary" | "secondary" }) =>
    `<a href="${b.href}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:10px;font-weight:600;text-decoration:none;font-size:15px;${
      b.tone === "secondary" ? "background:#eef0f3;color:#1c1c1e;" : "background:#c8102e;color:#ffffff;"
    }">${escapeHtml(b.label)}</a>`;
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1e">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
    <p style="margin:0 0 16px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6e6e73">${escapeHtml(APP_NAME)}</p>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${title}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#3a3a3c">${intro}</p>
    ${code ? `<p style="margin:0 0 20px;font-size:32px;letter-spacing:.3em;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(code)}</p>` : ""}
    ${buttons.length ? `<p style="margin:0 0 8px">${buttons.map(btn).join("")}</p>` : ""}
    ${footer ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6e6e73">${footer}</p>` : ""}
  </div>
</body></html>`;
}
