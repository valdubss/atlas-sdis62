import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Saisissez votre adresse e-mail.")
    .pipe(z.email("Adresse e-mail invalide.")),
});

export type LoginInput = z.infer<typeof loginSchema>;
