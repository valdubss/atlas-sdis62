import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s ? s : null));

const optionalUuid = z
  .string()
  .trim()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || z.uuid().safeParse(s).success, "Identifiant invalide.");

const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : Number(s.replace(",", "."))))
    .refine((n) => n === null || (Number.isFinite(n) && n >= min && n <= max), "Valeur invalide.");

export const CENTER_TYPES = ["cis", "cs", "cpi", "cta_codis", "direction", "service"] as const;

export const groupingSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Nom trop court.").max(80, "80 caractères maximum."),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
});

export const centerSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Nom trop court.").max(120, "120 caractères maximum."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9-]*$/, "Lettres minuscules, chiffres et tirets seulement.")
    .transform((s) => s || null),
  type: z.enum(CENTER_TYPES),
  grouping_id: optionalUuid,
  address: optionalText(200),
  postal_code: optionalText(10),
  city: optionalText(80),
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
  phone: optionalText(30),
  email: optionalText(160),
  presentation: optionalText(600),
  chief_id: optionalUuid,
  displayed_headcount: optionalNumber(0, 9999),
  cover_media_id: optionalUuid,
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  is_active: z.coerce.boolean().default(true),
});

export const serviceSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Nom trop court.").max(120, "120 caractères maximum."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9-]*$/, "Lettres minuscules, chiffres et tirets seulement.")
    .transform((s) => s || null),
  short_description: optionalText(140),
  mission: optionalText(2000),
  contact_reasons: z
    .string()
    .trim()
    .transform((s) =>
      s
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3),
    ),
  manager_id: optionalUuid,
  phone: optionalText(30),
  email: optionalText(160),
  address: optionalText(200),
  grouping_id: optionalUuid,
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
  is_active: z.coerce.boolean().default(true),
});

/** Slug lisible à partir d'un nom (accents retirés). */
export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
