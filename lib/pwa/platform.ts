/**
 * Appareil et mode d'ouverture, pour le bandeau « Mettre MySDIS sur l'écran d'accueil ».
 * Côté client uniquement (lit navigator) ; rien n'est envoyé.
 */
export type InstallPlatform =
  | "standalone" // ouverte depuis l'icône de l'écran d'accueil
  | "ios-safari"
  | "ios-browser" // Chrome, Firefox, Edge… sur iPhone : Partager est dans la barre d'adresse
  | "ios-inapp" // navigateur intégré d'une autre application (messagerie, réseau social)
  | "android"
  | "android-inapp"
  | "desktop";

export type InstallContext = { platform: InstallPlatform; safariMajor: number | null };

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Snapchat|Twitter|MicroMessenger|WhatsApp|GSA\/|; wv\)/;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function detectInstallContext(): InstallContext {
  const ua = navigator.userAgent;
  const safariMajor = Number(ua.match(/Version\/(\d+)/)?.[1]) || null;
  if (isStandalone()) return { platform: "standalone", safariMajor };
  // iPadOS se présente comme un Mac : écran tactile = iPad
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) {
    if (IN_APP.test(ua)) return { platform: "ios-inapp", safariMajor };
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return { platform: "ios-browser", safariMajor };
    return { platform: "ios-safari", safariMajor };
  }
  if (/Android/.test(ua)) return { platform: IN_APP.test(ua) ? "android-inapp" : "android", safariMajor };
  return { platform: "desktop", safariMajor };
}

/** Invite d'installation Chrome/Android, gardée dès le chargement par le script en ligne de la mise en page. */
export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const INSTALLABLE_EVENT = "mysdis:installable";
/** Ouvre le guide d'installation depuis n'importe où (ligne du profil). */
export const OPEN_INSTALL_EVENT = "mysdis:open-install";

type InstallWindow = Window & { __mysdisInstall?: DeferredInstallPrompt };

export function deferredInstallPrompt(): DeferredInstallPrompt | null {
  if (typeof window === "undefined") return null;
  return (window as InstallWindow).__mysdisInstall ?? null;
}

export function clearDeferredInstallPrompt() {
  (window as InstallWindow).__mysdisInstall = undefined;
  window.dispatchEvent(new Event(INSTALLABLE_EVENT));
}
