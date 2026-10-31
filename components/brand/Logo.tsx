import { APP_BRAND, APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";

// Deux fichiers générés par scripts/make-logo.mjs (reporter les proportions affichées) :
// le logo complet « MySDIS by ATLAS » et le mot seul pour les petites barres, où la ligne
// « by ATLAS » serait illisible.
const FULL = { file: "logo-atlas.png", ratio: 2.889 };
const COMPACT = { file: "logo-mysdis.png", ratio: 3.965 };
const COMPACT_BELOW = 36;
// Présence du fichier calculée au démarrage / à la construction (next.config.ts → NEXT_PUBLIC_HAS_LOGO).
const HAS_LOGO = process.env.NEXT_PUBLIC_HAS_LOGO === "1";

/**
 * Logo MySDIS by Atlas. Image blanche monochrome quand `public/logo-atlas.png` existe
 * (mot seul sous 36 px de haut), sinon le mot en Inter 600. `height` en px ; jamais
 * déformé, jamais recoloré.
 */
export function Logo({ height = 20, className }: { height?: number; className?: string }) {
  if (HAS_LOGO) {
    const { file, ratio } = height < COMPACT_BELOW ? COMPACT : FULL;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fichier statique, dimensions libres
      <img
        src={`/${file}`}
        alt={APP_BRAND}
        height={height}
        width={Math.round(height * ratio)}
        className={cn("block select-none", className)}
        style={{ height, width: "auto" }}
        draggable={false}
      />
    );
  }
  return (
    <span className={cn("select-none font-semibold tracking-[-0.02em] text-text-1", className)} style={{ fontSize: height * 0.85, lineHeight: 1 }} aria-label={APP_NAME}>
      {APP_NAME}
    </span>
  );
}

export function hasLogoFile() {
  return HAS_LOGO;
}
