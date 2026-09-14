import { z } from "zod";

export const FEEDBACK_CATEGORIES = [
  { id: "bug", label: "Un problème technique", hint: "Quelque chose ne fonctionne pas ou s'affiche mal." },
  { id: "content", label: "Un contenu", hint: "Une erreur ou un contenu inapproprié dans une publication." },
  { id: "suggestion", label: "Une suggestion", hint: "Une idée pour améliorer ATLAS." },
] as const;

export const feedbackSchema = z.object({
  category: z.enum(["bug", "content", "suggestion"], { message: "Choisissez une catégorie." }),
  description: z.string().trim().min(10, "Décrivez le problème en quelques mots (10 caractères minimum).").max(2000, "2000 caractères maximum."),
  screenshot_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid().nullable()),
  context: z.object({
    path: z.string().max(500).default("/"),
    user_agent: z.string().max(400).default(""),
    viewport: z.string().max(40).default(""),
    app_version: z.string().max(40).default(""),
  }),
});

export const FEEDBACK_STATUS = { new: "Nouveau", seen: "Vu", done: "Traité" } as const;
