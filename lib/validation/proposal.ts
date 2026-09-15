import { z } from "zod";
import { parseInput } from "@/lib/validation/event";

const optionalText = (max: number, msg?: string) =>
  z
    .string()
    .trim()
    .max(max, msg ?? `${max} caractères maximum.`)
    .transform((s) => (s ? s : null));

/** Proposition d'actu par un référent : texte, photos (jusqu'à 30) ou une vidéo. */
export const proposalPostSchema = z
  .object({
    kind: z.enum(["text", "photo", "video"]),
    title: optionalText(120),
    body: optionalText(2000),
    media: z.array(z.uuid()).max(30),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "text" && !v.body) ctx.addIssue({ code: "custom", path: ["body"], message: "Écrivez votre actu." });
    if (v.kind === "photo" && v.media.length === 0) ctx.addIssue({ code: "custom", path: ["media"], message: "Ajoutez au moins une photo." });
    if (v.kind === "video" && v.media.length !== 1) ctx.addIssue({ code: "custom", path: ["media"], message: "Ajoutez une vidéo." });
  });

/** Proposition d'événement (dates saisies en heure de Paris). */
export const proposalEventSchema = z
  .object({
    title: z.string().trim().min(2, "Donnez un titre à l'événement.").max(120, "120 caractères maximum."),
    description: optionalText(2000),
    location: optionalText(160),
    all_day: z.boolean(),
    starts_at: z.string().trim().min(1, "Indiquez la date de début."),
    ends_at: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const start = parseInput(v.starts_at, v.all_day, false);
    if (!start) ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Date de début invalide." });
    if (v.ends_at) {
      const end = parseInput(v.ends_at, v.all_day, true);
      if (!end) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Date de fin invalide." });
      else if (start && end < start) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "La fin est avant le début." });
    }
  });

/** Mise à jour de fiche proposée par un référent. */
export const centerUpdateSchema = z
  .object({
    presentation: optionalText(600),
    cover_media_id: z
      .string()
      .trim()
      .transform((s) => (s ? s : null))
      .pipe(z.uuid().nullable()),
  })
  .refine((v) => v.presentation !== null || v.cover_media_id !== null, { message: "Proposez une présentation ou une photo.", path: ["presentation"] });
