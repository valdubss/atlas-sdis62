/** Organisation des clés dans le bucket (voir docs/ARCHITECTURE.md §3). */
export const mediaKeys = {
  original: (id: string, ext: string) => `originals/${id}.${ext}`,
  variant: (id: string, name: "thumb" | "small" | "medium" | "full") => `variants/${id}/${name}.webp`,
  video: (id: string) => `videos/${id}.mp4`,
  poster: (id: string) => `posters/${id}.jpg`,
  /** Dossier HLS d'une vidéo : master.m3u8 + v{hauteur}/index.m3u8 + segments */
  hls: (id: string) => `hls/${id}`,
  subtitles: (id: string, lang: string) => `subtitles/${id}.${lang}.vtt`,
  avatar: (userId: string, version: number) => `avatars/${userId}-${version}.webp`,
};

export function extensionFor(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
    case "video/quicktime":
      return "mp4";
    default:
      return "bin";
  }
}
