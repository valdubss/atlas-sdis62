import { z } from "zod";

const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid("Valeur invalide.").nullable());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .transform((v) => (v === "" ? null : v));

export const EXPIRY_OPTIONS = [
  { hours: 24, label: "24 heures" },
  { hours: 48, label: "48 heures" },
  { hours: 72, label: "3 jours" },
  { hours: 168, label: "7 jours" },
] as const;

export const storySchema = z
  .object({
    id: optionalUuid,
    series_id: optionalUuid,
    series_title: optionalText(80),
    media_id: optionalUuid,
    overlay_text: optionalText(200),
    overlay_position: z.enum(["top", "middle", "bottom"]).default("bottom"),
    link_post_id: optionalUuid,
    display_seconds: z.coerce.number().int().min(3).max(15).default(7),
    expires_hours: z.coerce.number().int().min(1).max(168).default(48),
    action: z.enum(["draft", "publish", "schedule"]),
    scheduled_at: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((v, ctx) => {
    if (!v.series_id && !v.series_title) {
      ctx.addIssue({ code: "custom", path: ["series_title"], message: "Choisissez une série ou donnez un nom à une nouvelle série." });
    }
    if (!v.media_id && v.action !== "draft") {
      ctx.addIssue({ code: "custom", path: ["media"], message: "Ajoutez une photo ou une vidéo." });
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

export type StoryInput = z.infer<typeof storySchema>;
