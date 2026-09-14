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

/** Types disponibles dans l'éditeur à ce lot (photo/vidéo/sondage : lots c et f). */
export const EDITOR_POST_TYPES = ["text", "article"] as const;

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
  })
  .superRefine((v, ctx) => {
    if (v.type === "article" && !v.title) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Un article a besoin d'un titre." });
    }
    if (v.body.length === 0) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Le texte est obligatoire." });
    }
    if (v.type === "text" && v.body.length > 2000) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Une annonce courte fait 2000 caractères maximum. Choisissez le type Article.",
      });
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
