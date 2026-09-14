/** Ressort iOS unique pour toute l'interface (DESIGN.md §1.5). */
export const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

/** Retour haptique discret (réaction, vote) si l'appareil le permet. */
export function haptic() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
  } catch {
    /* ignoré */
  }
}
