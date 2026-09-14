import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(1, "Champ obligatoire.")
  .max(60, "60 caractères maximum.");

export const profileSchema = z.object({
  first_name: name,
  last_name: name,
  center_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid("Centre invalide.").nullable()),
});

export type ProfileInput = z.infer<typeof profileSchema>;
