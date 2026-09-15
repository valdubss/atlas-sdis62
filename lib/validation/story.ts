import { z } from "zod";
import { fromLocalInput } from "@/lib/time";
import { clampRel, normalizePollOptions, POLL_QUESTION_MAX_LENGTH, QUESTION_PROMPT_MAX_LENGTH, validatePoll } from "@/lib/stories/overlay";

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

/** Coordonnée relative facultative (champ vide → null), bornée dans [0, 1]. */
const optionalRel = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : clampRel(Number(v))))
  .pipe(z.number().min(0).max(1).nullable());

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
    overlay_x: optionalRel,
    overlay_y: optionalRel,
    link_post_id: optionalUuid,
    display_seconds: z.coerce.number().int().min(3).max(15).default(7),
    expires_hours: z.coerce.number().int().min(1).max(168).default(48),
    action: z.enum(["draft", "publish", "schedule"]),
    scheduled_at: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
    // Sondage superposé (facultatif) : question + options séparées par des retours à la ligne
    poll_question: optionalText(POLL_QUESTION_MAX_LENGTH),
    poll_options: z
      .string()
      .default("")
      .transform((v) => normalizePollOptions(v.split(/\r?\n/))),
    poll_x: optionalRel,
    poll_y: optionalRel,
    // Question ouverte superposée (facultatif)
    question_prompt: optionalText(QUESTION_PROMPT_MAX_LENGTH),
    question_x: optionalRel,
    question_y: optionalRel,
  })
  .superRefine((v, ctx) => {
    if (!v.series_id && !v.series_title) {
      ctx.addIssue({ code: "custom", path: ["series_title"], message: "Choisissez une série ou donnez un nom à une nouvelle série." });
    }
    if (!v.media_id && v.action !== "draft") {
      ctx.addIssue({ code: "custom", path: ["media"], message: "Ajoutez une photo ou une vidéo." });
    }
    if (v.action === "schedule") {
      const d = fromLocalInput(v.scheduled_at);
      if (!d) {
        ctx.addIssue({ code: "custom", path: ["scheduled_at"], message: "Date de publication invalide." });
      } else if (d.getTime() < Date.now() + 60_000) {
        ctx.addIssue({ code: "custom", path: ["scheduled_at"], message: "La date doit être dans le futur." });
      }
    }
    if (v.poll_question || v.poll_options.length > 0) {
      const err = validatePoll(v.poll_question ?? "", v.poll_options);
      if (err) ctx.addIssue({ code: "custom", path: ["poll"], message: err });
    }
  });

export type StoryInput = z.infer<typeof storySchema>;
