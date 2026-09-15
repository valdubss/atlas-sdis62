/**
 * Contraste d'un texte superposé sur une image (stories) : luminance moyenne de
 * la zone où le texte s'affiche, rapport WCAG contre un texte blanc.
 * Seuil recommandé : 4,5:1 (AA) ; les stories ajoutent une ombre, on avertit
 * sans bloquer.
 */
export function relativeLuminance(r: number, g: number, b: number) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(l1: number, l2: number) {
  const [a, b] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

/** Zone du texte dans un cadre 9:16 selon la position (fractions de hauteur). */
export function textZone(position: "top" | "middle" | "bottom"): { from: number; to: number } {
  if (position === "top") return { from: 0.08, to: 0.3 };
  if (position === "middle") return { from: 0.4, to: 0.6 };
  return { from: 0.68, to: 0.9 };
}

/** Contraste texte blanc / zone d'image à partir de pixels RGBA (ImageData.data) d'une image de largeur w et hauteur h. */
export function whiteTextContrast(data: Uint8ClampedArray, w: number, h: number, position: "top" | "middle" | "bottom") {
  const { from, to } = textZone(position);
  const y0 = Math.floor(h * from);
  const y1 = Math.max(y0 + 1, Math.floor(h * to));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      sum += relativeLuminance(data[i], data[i + 1], data[i + 2]);
      n++;
    }
  }
  const lum = n ? sum / n : 0;
  return contrastRatio(1, lum);
}

/** Charge une image et mesure le contraste de la zone du texte (navigateur). */
export async function measureImageContrast(src: string, position: "top" | "middle" | "bottom"): Promise<number | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image"));
      img.src = src;
    });
    const w = 90;
    const h = 160;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Recadrage « cover » 9:16 comme dans le viewer
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return whiteTextContrast(ctx.getImageData(0, 0, w, h).data, w, h, position);
  } catch {
    return null;
  }
}
