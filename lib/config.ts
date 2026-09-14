/**
 * Constantes produit. Le nom de l'app est modifiable ici (et dans app_settings
 * côté base pour les e-mails / notifications).
 */
export const APP_NAME = "ATLAS";
/** Mot-symbole : nom en marine + « 62 » en rouge comme élément graphique. */
export const APP_WORDMARK = { word: "ATLAS", accent: "62" } as const;
export const APP_TAGLINE = "L'actualité interne du SDIS 62";
export const ORG_NAME = "SDIS 62";
export const ORG_LONG_NAME =
  "Service Départemental d'Incendie et de Secours du Pas-de-Calais";

/**
 * Fonctionnalités activables. Le modèle de données reste complet : passer un
 * drapeau à true réaffiche la fonctionnalité sans migration.
 */
export const FEATURES = {
  categories: false, // puces et champ « catégorie »
  centers: false, // filtre et champ « centre »
  tags: false, // champ « tags »
  authorChoice: true, // choix « Service Communication » / nom de l'éditeur
} as const;

export const LIMITS = {
  imagesPerPost: 20,
  videoMaxBytes: 200 * 1024 * 1024,
  imageMaxBytes: 30 * 1024 * 1024,
  storyVideoMaxSeconds: 30,
  commentMaxLength: 1000,
  pinnedMax: 3,
  tagsMax: 10,
  passwordMinLength: 10,
} as const;

export const ACCEPTED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const ACCEPTED_VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;
export const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov";

export const REACTIONS = [
  { kind: "clap", emoji: "👏", label: "Bravo" },
  { kind: "fire", emoji: "🔥", label: "Au top" },
  { kind: "heart", emoji: "❤️", label: "J'adore" },
  { kind: "muscle", emoji: "💪", label: "Courage" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["kind"];

export const NAV_ITEMS = [
  { href: "/", label: "Fil", icon: "feed" },
  { href: "/galerie", label: "Galerie", icon: "gallery" },
  { href: "/favoris", label: "Favoris", icon: "bookmark" },
  { href: "/profil", label: "Profil", icon: "user" },
] as const;

export const ROLE_LABELS = {
  admin: "Administrateur",
  editor: "Éditeur",
  reader: "Agent",
} as const;
