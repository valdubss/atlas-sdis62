"use client";

import { useEffect } from "react";
import { SW_URL } from "@/lib/push/client";

/** Enregistre le service worker (cache de l'interface, réception des push). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !process.env.NEXT_PUBLIC_SW_DEV) return;
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
