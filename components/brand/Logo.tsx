import { existsSync } from "node:fs";
import path from "node:path";
import { Ecg } from "./Ecg";
import { APP_NAME } from "@/lib/config";

const LOGO_FILE = "logo-sdis62.png";
// Évalué une fois au démarrage du serveur : le fichier est-il présent dans public/ ?
const HAS_LOGO = existsSync(path.join(process.cwd(), "public", LOGO_FILE));

/** Vrai si le logo PNG est présent (sinon le mot-symbole tient lieu de nom). */
export function hasLogo() {
  return HAS_LOGO;
}

/**
 * Logo SDIS 62 (public/logo-sdis62.png), toujours sur fond blanc, jamais
 * déformé ni recoloré. Si le fichier est absent, le mot-symbole « FLASH 62 »
 * prend le relais. Composant serveur : aucun JS envoyé au client.
 */
export function Logo({ height = 36, className }: { height?: number; className?: string }) {
  if (!HAS_LOGO) return <Wordmark height={height} className={className} />;

  return (
    <span
      className={["inline-flex items-center rounded-md bg-white px-1", className]
        .filter(Boolean)
        .join(" ")}
      style={{ height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fichier statique local, dimensions libres */}
      <img
        src={`/${LOGO_FILE}`}
        alt="SDIS 62"
        style={{ height: height - 4, width: "auto" }}
        decoding="async"
      />
    </span>
  );
}

export function Wordmark({ height = 36, className }: { height?: number; className?: string }) {
  const [word, num] = APP_NAME.split(/\s+(?=\d)/);
  return (
    <span
      className={["inline-flex items-end gap-1 font-display uppercase leading-none", className]
        .filter(Boolean)
        .join(" ")}
      style={{ fontSize: height * 0.75 }}
      aria-label={APP_NAME}
    >
      <span className="font-bold text-navy">{word}</span>
      <span className="font-extrabold text-red">{num}</span>
      <Ecg className="mb-1 h-[0.5em] w-[1.6em] text-red" strokeWidth={2.5} />
    </span>
  );
}
