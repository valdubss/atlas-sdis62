import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(1, "Champ obligatoire.")
  .max(60, "60 caractères maximum.");

export const profileSchema = z.object({
  first_name: name,
  last_name: name,
});

const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid("Identifiant invalide.").nullable());

/** Profil → Mon centre : rattachement, présentation, annuaire. */
export const centerSettingsSchema = z.object({
  job_title: z.string().trim().max(60, "60 caractères maximum.").transform((s) => s || null),
  work_phone: z.string().trim().max(30, "30 caractères maximum.").transform((s) => s || null),
  present_me: z.boolean(),
  directory_visible: z.boolean(),
});

export const attachSchema = z.object({ center_id: optionalUuid, service_id: optionalUuid });

export type ProfileInput = z.infer<typeof profileSchema>;
