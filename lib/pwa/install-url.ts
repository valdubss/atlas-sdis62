import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";

/** Adresse publique de la page d'installation : NEXT_PUBLIC_SITE_URL en https, sinon l'hôte de la requête. */
export async function installUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (env?.startsWith("https://")) return `${env}/installer`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/installer`;
}

const QR_OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#000000", light: "#ffffff" } };

export function installQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg" });
}

export function installQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width: 1024 });
}
