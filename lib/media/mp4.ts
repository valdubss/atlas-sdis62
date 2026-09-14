/**
 * Lecture minimale des boîtes ISO BMFF (MP4 / MOV) côté navigateur pour
 * connaître le codec vidéo sans dépendance externe.
 * Retourne les types d'entrées d'échantillons trouvés (ex. "avc1", "hvc1", "mp4a").
 */
export function readSampleEntryTypes(buf: ArrayBuffer): string[] {
  const view = new DataView(buf);
  const found: string[] = [];
  const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

  function type(at: number) {
    return String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  }

  function walk(start: number, end: number, depth: number) {
    let pos = start;
    while (pos + 8 <= end) {
      let size = view.getUint32(pos);
      let header = 8;
      if (size === 1) {
        // taille 64 bits
        const hi = view.getUint32(pos + 8);
        const lo = view.getUint32(pos + 12);
        size = hi * 2 ** 32 + lo;
        header = 16;
      } else if (size === 0) {
        size = end - pos;
      }
      if (size < header) return;
      const t = type(pos + 4);
      const boxEnd = Math.min(pos + size, end);

      if (CONTAINERS.has(t)) {
        walk(pos + header, boxEnd, depth + 1);
      } else if (t === "stsd") {
        // version/flags (4) + entry_count (4) puis entrées : size(4) type(4)
        let p = pos + header + 8;
        const count = view.getUint32(pos + header + 4);
        for (let i = 0; i < count && p + 8 <= boxEnd; i++) {
          const esize = view.getUint32(p);
          found.push(type(p + 4));
          if (esize < 8) break;
          p += esize;
        }
      }
      pos = boxEnd;
    }
  }

  walk(0, buf.byteLength, 0);
  if (found.length > 0) return found;

  // Tampon partiel (fin d'un fichier dont le « moov » est en queue) : les
  // boîtes ne commencent pas au début, on cherche la signature « moov ».
  const bytes = new Uint8Array(buf);
  for (let i = 4; i + 4 <= bytes.length; i++) {
    if (bytes[i] === 0x6d && bytes[i + 1] === 0x6f && bytes[i + 2] === 0x6f && bytes[i + 3] === 0x76) {
      const start = i - 4;
      const size = view.getUint32(start);
      if (size >= 16 && size <= buf.byteLength - start + 16) {
        walk(start, Math.min(start + size, buf.byteLength), 0);
        if (found.length > 0) return found;
      }
    }
  }
  return found;
}

const H264 = new Set(["avc1", "avc2", "avc3", "avc4"]);

/** Vrai si la piste vidéo est encodée en H.264 (AVC). */
export function isH264(sampleTypes: string[]) {
  return sampleTypes.some((t) => H264.has(t));
}

export function describeVideoCodec(sampleTypes: string[]) {
  if (sampleTypes.some((t) => t === "hvc1" || t === "hev1")) return "HEVC (H.265)";
  if (sampleTypes.some((t) => t === "av01")) return "AV1";
  if (sampleTypes.some((t) => t === "vp09")) return "VP9";
  const video = sampleTypes.find((t) => !["mp4a", "ac-3", "ec-3", "Opus", "twos", "sowt"].includes(t));
  return video ?? "inconnu";
}
