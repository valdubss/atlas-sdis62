import "server-only";

import sharp from "sharp";

export const VARIANT_WIDTHS = { thumb: 400, medium: 1200, full: 2400 } as const;
export type VariantName = keyof typeof VARIANT_WIDTHS;

/**
 * Génère les variantes WebP d'une image (orientation EXIF appliquée, métadonnées
 * retirées). Retourne aussi les dimensions de la variante « full » (= image
 * d'origine si elle est plus petite que 2400 px).
 */
export async function makeImageVariants(original: Buffer) {
  const base = sharp(original, { failOn: "none", limitInputPixels: 80_000_000 }).rotate();
  const out: Record<VariantName, Buffer> = { thumb: Buffer.alloc(0), medium: Buffer.alloc(0), full: Buffer.alloc(0) };
  let width = 0;
  let height = 0;

  for (const name of ["full", "medium", "thumb"] as const) {
    const { data, info } = await base
      .clone()
      .resize({ width: VARIANT_WIDTHS[name], withoutEnlargement: true })
      .webp({ quality: name === "thumb" ? 76 : 82, effort: 3 })
      .toBuffer({ resolveWithObject: true });
    out[name] = data;
    if (name === "full") {
      width = info.width;
      height = info.height;
    }
  }

  return { variants: out, width, height };
}

/** Avatar carré 256 px. */
export async function makeAvatar(original: Buffer) {
  return sharp(original, { failOn: "none" })
    .rotate()
    .resize(256, 256, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}
