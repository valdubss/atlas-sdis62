import "server-only";

/**
 * « Fast start » MP4 sans ffmpeg : déplace la boîte `moov` (index des
 * échantillons) avant `mdat`. Les vidéos iPhone la placent en fin de fichier,
 * ce qui oblige le navigateur à télécharger tout le fichier avant la première
 * image. Les décalages de chunks (`stco` / `co64`) sont corrigés d'autant.
 *
 * Renvoie `null` si le fichier est déjà lisible en flux ou hors périmètre
 * (structure inattendue, moov compressé) : l'original est alors conservé.
 */
type Atom = { type: string; offset: number; size: number; header: number };

function readAtoms(buf: Buffer, start: number, end: number): Atom[] {
  const atoms: Atom[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) return atoms;
    atoms.push({ type: buf.toString("latin1", pos + 4, pos + 8), offset: pos, size, header });
    pos += size;
  }
  return atoms;
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

/** Applique `shift` à chaque décalage de chunk de la boîte moov (copie). */
function patchOffsets(moov: Buffer, moovEnd: number, shift: (v: number) => number): boolean {
  let ok = true;
  const walk = (start: number, end: number) => {
    for (const a of readAtoms(moov, start, end)) {
      if (CONTAINERS.has(a.type)) walk(a.offset + a.header, a.offset + a.size);
      else if (a.type === "cmov") ok = false;
      else if (a.type === "stco") {
        const count = moov.readUInt32BE(a.offset + a.header + 4);
        let p = a.offset + a.header + 8;
        for (let i = 0; i < count && p + 4 <= a.offset + a.size; i++, p += 4) {
          const v = shift(moov.readUInt32BE(p));
          if (v > 0xffffffff) {
            ok = false;
            return;
          }
          moov.writeUInt32BE(v, p);
        }
      } else if (a.type === "co64") {
        const count = moov.readUInt32BE(a.offset + a.header + 4);
        let p = a.offset + a.header + 8;
        for (let i = 0; i < count && p + 8 <= a.offset + a.size; i++, p += 8) {
          moov.writeBigUInt64BE(BigInt(shift(Number(moov.readBigUInt64BE(p)))), p);
        }
      }
    }
  };
  walk(0, moovEnd);
  return ok;
}

export function faststart(input: Buffer): Buffer | null {
  const atoms = readAtoms(input, 0, input.length);
  const ftyp = atoms.find((a) => a.type === "ftyp");
  const moov = atoms.find((a) => a.type === "moov");
  const mdat = atoms.find((a) => a.type === "mdat");
  if (!ftyp || !moov || !mdat || ftyp.offset !== 0) return null;
  if (moov.offset < mdat.offset) return null; // déjà en lecture progressive

  // Nouvelle disposition : ftyp, moov, [tout ce qui était entre ftyp et moov], [ce qui suivait moov]
  const moovCopy = Buffer.from(input.subarray(moov.offset, moov.offset + moov.size));
  const moovEnd = moov.offset + moov.size;
  const ok = patchOffsets(moovCopy, moovCopy.length, (v) => (v >= moovEnd ? v : v + moov.size));
  if (!ok) return null;

  return Buffer.concat([
    input.subarray(0, ftyp.size),
    moovCopy,
    input.subarray(ftyp.size, moov.offset),
    input.subarray(moovEnd),
  ]);
}
