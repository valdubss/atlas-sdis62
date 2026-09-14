import { z } from "zod";
import { LIMITS } from "@/lib/config";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Saisissez votre adresse e-mail.")
  .pipe(z.email("Adresse e-mail invalide."));

const password = z
  .string()
  .min(LIMITS.passwordMinLength, `${LIMITS.passwordMinLength} caractères minimum.`)
  .max(128, "128 caractères maximum.");

export const loginSchema = z.object({ email });

export const passwordLoginSchema = z.object({
  email,
  password: z.string().min(1, "Saisissez votre mot de passe."),
});

export const setPasswordSchema = z
  .object({
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Les deux mots de passe ne correspondent pas.",
  });

export type LoginInput = z.infer<typeof loginSchema>;
