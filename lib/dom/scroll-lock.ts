/**
 * Verrouillage du défilement de la page pendant une feuille, une lightbox ou
 * une story. `overflow: hidden` sur body ne suffit pas sous iOS Safari : on
 * fige le body en position fixe à la position courante, puis on la restitue.
 * Compteur : plusieurs surfaces peuvent se superposer.
 */
let locks = 0;
let savedY = 0;

export function lockScroll() {
  if (typeof document === "undefined") return;
  if (locks++ > 0) return;
  savedY = window.scrollY;
  const b = document.body.style;
  b.position = "fixed";
  b.top = `-${savedY}px`;
  b.left = "0";
  b.right = "0";
  b.width = "100%";
  b.overflow = "hidden";
}

export function unlockScroll() {
  if (typeof document === "undefined") return;
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  const b = document.body.style;
  b.position = "";
  b.top = "";
  b.left = "";
  b.right = "";
  b.width = "";
  b.overflow = "";
  window.scrollTo({ top: savedY, behavior: "instant" as ScrollBehavior });
}
