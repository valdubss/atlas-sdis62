import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = { title: "Hors ligne" };

/** Page servie par le service worker quand le réseau est indisponible. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg-0 px-5 text-center">
      <Logo height={32} />
      <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Vous êtes hors ligne</p>
      <p className="max-w-xs text-[15px] text-text-2">Les actualités se chargeront dès que la connexion sera rétablie.</p>
    </main>
  );
}
