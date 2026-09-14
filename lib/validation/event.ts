import { z } from "zod";
import { fromLocalInput } from "@/lib/time";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s ? s : null));

/** Formulaire d'événement (Studio → Agenda). Les dates sont saisies en heure de Paris. */
export const eventSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")).transform((s) => s || null),
    title: z.string().trim().min(2, "Donnez un titre à l'événement.").max(120, "120 caractères maximum."),
    description: optionalText(2000),
    location: optionalText(160),
    all_day: z.coerce.boolean(),
    // Journée entière : « YYYY-MM-DD » ; sinon « YYYY-MM-DDTHH:mm »
    starts_at: z.string().trim().min(1, "Indiquez la date de début."),
    ends_at: z.string().trim(),
    post_id: z.string().uuid().or(z.literal("")).transform((s) => s || null),
    status: z.enum(["draft", "published"]),
  })
  .superRefine((v, ctx) => {
    const start = parseInput(v.starts_at, v.all_day, false);
    if (!start) ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Date de début invalide." });
    if (v.ends_at) {
      const end = parseInput(v.ends_at, v.all_day, true);
      if (!end) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Date de fin invalide." });
      else if (start && end.getTime() < start.getTime()) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "La fin doit être après le début." });
    }
  });

export type EventInput = z.infer<typeof eventSchema>;

/**
 * Convertit une saisie en instant UTC. Journée entière : début à 00:00 et fin
 * à 23:59 (heure de Paris) du jour choisi.
 */
export function parseInput(value: string, allDay: boolean, isEnd: boolean): Date | null {
  if (!value) return null;
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = value.slice(0, 10);
    return fromLocalInput(`${day}T${isEnd ? "23:59" : "00:00"}`);
  }
  return fromLocalInput(value);
}
