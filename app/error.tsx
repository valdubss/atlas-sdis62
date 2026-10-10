"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";

/** Erreur inattendue (serveur ou rendu) : écran en français, retour au fil ou nouvel essai. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("erreur page", error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-0 px-6 text-center">
      <Logo height={36} />
      <h1 className="mt-8 text-[22px] font-semibold tracking-[-0.02em] text-text-1">Un problème est survenu</h1>
      <p className="mt-2 max-w-[360px] text-[15px] text-text-2">La page n&apos;a pas pu s&apos;afficher. Réessayez ; si le problème persiste, signalez-le depuis votre profil.</p>
      {error.digest && <p className="mt-2 text-[12px] text-text-3">Référence : {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <Button type="button" onClick={reset}>
          Réessayer
        </Button>
        <Link href="/" className="pressable inline-flex h-12 items-center rounded-[12px] bg-bg-1 px-5 text-[15px] font-semibold text-text-1">
          Retour au fil
        </Link>
      </div>
    </main>
  );
}
