import { z } from "zod";
import { LIMITS } from "@/lib/config";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .transform((v) => (v === "" ? null : v));

const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid("Valeur invalide.").nullable());

/** Types disponibles dans l'éditeur (sondage : lot f). */
export const EDITOR_POST_TYPES = ["text", "photo", "video", "article"] as const;
export type EditorPostType = (typeof EDITOR_POST_TYPES)[number];

const mediaRef = z.object({
  id: z.uuid(),
  kind: z.enum(["image", "video"]),
  alt: z.string().trim().max(300).default(""),
});

export const postSchema = z
  .object({
    id: optionalUuid,
    type: z.enum(EDITOR_POST_TYPES, { message: "Type de publication invalide." }),
    title: optionalText(200),
    excerpt: optionalText(500),
    body: z.string().trim().max(50000, "Texte trop long."),
    category_id: optionalUuid,
    center_id: optionalUuid,
    tags: z
      .string()
      .transform((v) =>
        Array.from(
          new Set(
            v
              .split(/[,\n]/)
              .map((t) => t.trim().replace(/^#/, "").toLowerCase())
              .filter(Boolean),
          ),
        ),
      )
      .pipe(
        z
          .array(z.string().max(30, "Tag trop long (30 caractères max)."))
          .max(LIMITS.tagsMax, `${LIMITS.tagsMax} tags maximum.`),
      ),
    author_display: z.enum(["service_com", "agent"]),
    comments_enabled: z.boolean(),
    pinned: z.boolean(),
    action: z.enum(["draft", "publish", "schedule"]),
    scheduled_at: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
    media: z
      .string()
      .transform((v, ctx) => {
        try {
          return v ? (JSON.parse(v) as unknown) : [];
        } catch {
          ctx.addIssue({ code: "custom", message: "Liste de médias invalide." });
          return z.NEVER;
        }
      })
      .pipe(z.array(mediaRef).max(LIMITS.imagesPerPost, `${LIMITS.imagesPerPost} médias maximum.`)),
  })
  .superRefine((v, ctx) => {
    const images = v.media.filter((m) => m.kind === "image");
    const videos = v.media.filter((m) => m.kind === "video");
    const publishing = v.action !== "draft";

    if (v.type === "article" && !v.title) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Un article a besoin d'un titre." });
    }
    if (v.type === "text" && v.body.length === 0) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Le texte est obligatoire." });
    }
    if (v.type === "article" && v.body.length === 0) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Le texte de l'article est obligatoire." });
    }
    if (v.type === "text" && v.body.length > 2000) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Une annonce courte fait 2000 caractères maximum. Choisissez le type Article." });
    }
    if (v.type === "photo") {
      if (videos.length > 0) ctx.addIssue({ code: "custom", path: ["media"], message: "Une publication Photos ne contient que des images." });
      if (publishing && images.length === 0) ctx.addIssue({ code: "custom", path: ["media"], message: "Ajoutez au moins une photo." });
    }
    if (v.type === "video") {
      if (videos.length !== 1 || images.length > 0) {
        if (publishing || v.media.length > 0)
          ctx.addIssue({ code: "custom", path: ["media"], message: "Une publication Vidéo contient exactement une vidéo." });
      }
    }
    if (v.type === "article" && (videos.length > 0 || images.length > 1)) {
      ctx.addIssue({ code: "custom", path: ["media"], message: "Un article accepte une seule image de couverture." });
    }
    if (v.type === "text" && v.media.length > 0) {
      ctx.addIssue({ code: "custom", path: ["media"], message: "Une annonce ne contient pas de média : choisissez Photos ou Vidéo." });
    }
    if (v.action === "schedule") {
      const d = v.scheduled_at ? new Date(v.scheduled_at) : null;
      if (!d || Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", path: ["scheduled_at"], message: "Date de publication invalide." });
      } else if (d.getTime() < Date.now() + 60_000) {
        ctx.addIssue({ code: "custom", path: ["scheduled_at"], message: "La date doit être dans le futur." });
      }
    }
  });

export type PostInput = z.infer<typeof postSchema>;
