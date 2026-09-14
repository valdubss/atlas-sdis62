import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";

const LOGO_FILE = "logo-atlas.png";
// Présence du fichier calculée au démarrage / à la construction (next.config.ts → NEXT_PUBLIC_HAS_LOGO).
const HAS_LOGO = process.env.NEXT_PUBLIC_HAS_LOGO === "1";
// Proportion largeur/hauteur du fichier préparé par scripts/prepare-logo.mjs (mot ATLAS + SDIS 62).
const RATIO = 3.7;

/**
 * Logo ATLAS. Image blanche monochrome quand `public/logo-atlas.png` existe,
 * sinon le mot en Inter 600. `height` en px ; jamais déformé, jamais recoloré.
 */
export function Logo({ height = 20, className }: { height?: number; className?: string }) {
  if (HAS_LOGO) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fichier statique, dimensions libres
      <img
        src={`/${LOGO_FILE}`}
        alt={APP_NAME}
        height={height}
        width={Math.round(height * RATIO)}
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
