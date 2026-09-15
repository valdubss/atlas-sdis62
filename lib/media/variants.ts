import "server-only";

import sharp from "sharp";

export const VARIANT_WIDTHS = { thumb: 400, small: 800, medium: 1200, full: 2400 } as const;
export type VariantName = keyof typeof VARIANT_WIDTHS;

/**
 * Génère les variantes WebP d'une image (orientation EXIF appliquée, métadonnées
 * retirées). Retourne aussi les dimensions de la variante « full » (= image
 * d'origine si elle est plus petite que 2400 px).
 */
export async function makeImageVariants(original: Buffer) {
  const base = sharp(original, { failOn: "none", limitInputPixels: 80_000_000 }).rotate();
  const out: Record<VariantName, Buffer> = { thumb: Buffer.alloc(0), small: Buffer.alloc(0), medium: Buffer.alloc(0), full: Buffer.alloc(0) };
  let width = 0;
  let height = 0;

  const QUALITY: Record<VariantName, number> = { thumb: 72, small: 78, medium: 78, full: 80 };
  for (const name of ["full", "medium", "small", "thumb"] as const) {
    const { data, info } = await base
      .clone()
      .resize({ width: VARIANT_WIDTHS[name], withoutEnlargement: true })
      .webp({ quality: QUALITY[name], effort: 3 })
      .toBuffer({ resolveWithObject: true });
    out[name] = data;
    if (name === "full") {
      width = info.width;
      height = info.height;
    }
  }

  // Aperçu flou 20 px (data URI WebP) affiché sous l'image le temps du chargement
  const tiny = await base.clone().resize({ width: 20, withoutEnlargement: true }).blur(1).webp({ quality: 40 }).toBuffer();
  const lqip = `data:image/webp;base64,${tiny.toString("base64")}`;

  return { variants: out, width, height, lqip };
}

/** Avatar carré 256 px. */
export async function makeAvatar(original: Buffer) {
  return sharp(original, { failOn: "none" })
    .rotate()
    .resize(256, 256, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}
