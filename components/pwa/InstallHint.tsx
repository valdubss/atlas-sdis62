"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
import { detectInstallContext } from "@/lib/pwa/platform";

const noopSubscribe = () => () => {};
const isMobileBrowser = () => {
  const p = detectInstallContext().platform;
  return p !== "standalone" && p !== "desktop";
};

/** Écran de connexion ouvert dans le navigateur d'un téléphone : lien vers la page d'installation. */
export function InstallHint() {
  const show = useSyncExternalStore(noopSubscribe, isMobileBrowser, () => false);
  if (!show) return null;
  return (
    <Link href="/installer" className="pressable mx-auto mt-5 flex h-11 items-center gap-2 rounded-full bg-black/35 px-4 text-[15px] font-medium text-white backdrop-blur-sm">
      <Smartphone size={18} strokeWidth={1.75} aria-hidden="true" />
      Installer l&apos;app sur ce téléphone
    </Link>
  );
}
