import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

/** Adresse inconnue ou contenu retiré (publication supprimée ouverte depuis une notification, par exemple). */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-0 px-6 text-center">
      <Logo height={36} />
      <h1 className="mt-8 text-[22px] font-semibold tracking-[-0.02em] text-text-1">Contenu introuvable</h1>
      <p className="mt-2 max-w-[360px] text-[15px] text-text-2">Cette page n&apos;existe pas ou a été retirée. Elle a peut-être été supprimée par le service communication.</p>
      <Link href="/" className="pressable mt-6 inline-flex h-12 items-center rounded-[12px] bg-red-fill px-5 text-[15px] font-semibold text-white">
        Retour au fil
      </Link>
    </main>
  );
}
