/** Rôle de l'auteur d'une note pour l'affichage. */
export type NoteAuthorRole = "chief" | "com" | "service_com" | null;

export type CenterNote = {
  id: string;
  center_id: string;
  title: string;
  body: string | null;
  kind: "pdf" | "image";
  file_key: string;
  file_name: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  pinned: boolean;
  published_at: string;
  author: { id: string; name: string | null; avatar_key: string | null; role: NoteAuthorRole } | null;
};

export const NOTE_LIMITS = {
  pdfMaxBytes: 25 * 1024 * 1024,
  imageMaxBytes: 12 * 1024 * 1024,
  titleMax: 140,
  bodyMax: 2000,
} as const;

export const NOTE_ROLE_LABELS: Record<Exclude<NoteAuthorRole, null>, string> = {
  chief: "Chef de centre",
  com: "Responsable communication",
  service_com: "Service communication",
};
