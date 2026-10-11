/** Documents utiles (fiches réflexes, procédures, formulaires) : partagés à tout le SDIS. */
export type DocumentItem = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  kind: "pdf" | "image";
  file_key: string;
  file_name: string | null;
  file_size: number;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

export const DOC_LIMITS = {
  pdfMaxBytes: 40 * 1024 * 1024,
  imageMaxBytes: 12 * 1024 * 1024,
  titleMax: 140,
  categoryMax: 60,
  descriptionMax: 500,
} as const;

export const DOC_DEFAULT_CATEGORY = "Général";

/** Clé locale de la liste des documents gardés hors ligne (identifiants). */
export const OFFLINE_DOCS_KEY = "atlas:docs:offline";
/** Cache du navigateur (Cache API) qui garde les fichiers hors ligne. */
export const OFFLINE_DOCS_CACHE = "atlas-docs";

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
}
