import { installQrPng, installUrl } from "@/lib/pwa/install-url";

export const runtime = "nodejs";

/** QR code de la page d'installation, en PNG 1024 px (affiches, e-mails, messageries). */
export async function GET() {
  const png = await installQrPng(await installUrl());
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="mysdis-installer-qr.png"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
