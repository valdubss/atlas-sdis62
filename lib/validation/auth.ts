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

/** Connexion par e-mail ou matricule (mode « registry »). */
export const identifierLoginSchema = z.object({
  identifier: z.string().trim().min(1, "Saisissez votre e-mail ou votre matricule.").max(120),
  password: z.string().min(1, "Saisissez votre mot de passe."),
});

/** Première connexion par matricule : matricule, nom, prénom (vérifiés dans le référentiel). */
const personName = z.string().trim().min(1, "Champ obligatoire.").max(60, "60 caractères maximum.");
export const firstAccessSchema = z.object({
  matricule: z.string().trim().min(3, "Saisissez votre matricule.").max(20, "Matricule trop long."),
  lastName: personName,
  firstName: personName,
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
