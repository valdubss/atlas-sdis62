"use client";

import { useEffect } from "react";

/**
 * Lien e-mail standard Supabase ouvert hors flux PKCE : les jetons arrivent dans le
 * fragment (#access_token=…), parfois sur l'écran de connexion quand Supabase retombe
 * sur l'URL du site. Ils sont renvoyés au point d'arrivée qui pose la session.
 */
export function HashRelay() {
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = h.get("access_token");
    const refresh = h.get("refresh_token");
    if (!access || !refresh) return;
    const q = new URLSearchParams({ access_token: access, refresh_token: refresh, next: "/" });
    window.location.replace(`/auth/callback?${q.toString()}`);
  }, []);
  return null;
}
