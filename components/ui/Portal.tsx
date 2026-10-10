"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Rend ses enfants directement sous <body>. Les surfaces en position fixe
 * (feuilles, visionneuses) ne dépendent ainsi plus de leur parent : un
 * ancêtre transformé ou en `content-visibility` deviendrait sinon leur bloc
 * conteneur et les figerait au milieu de la page.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
