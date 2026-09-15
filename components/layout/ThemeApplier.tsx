"use client";

import { useEffect } from "react";

export type Theme = "system" | "light" | "dark";

/** Applique le thème sur <html> (attribut data-theme) et le mémorise sur l'appareil. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("atlas:theme", theme);
  } catch {}
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0a0c" : "#f4f4f6");
}

/**
 * Thème de l'agent (préférence en base, repli sur la valeur gardée sur
 * l'appareil) appliqué dès le montage ; suit le système en mode « système ».
 */
export function ThemeApplier({ theme }: { theme: Theme }) {
  useEffect(() => {
    let t: Theme = theme;
    try {
      const local = localStorage.getItem("atlas:theme") as Theme | null;
      if (theme === "system" && (local === "light" || local === "dark")) t = local;
    } catch {}
    applyTheme(t);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.getAttribute("data-theme") || applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  return null;
}
