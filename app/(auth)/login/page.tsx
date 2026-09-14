import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { Logo } from "@/components/brand/Logo";
import { APP_NAME } from "@/lib/config";
import { getAllowedDomains } from "@/lib/auth/domains";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  desactive: "Votre compte a été désactivé. Contactez le service communication.",
  lien: "Ce lien de connexion est invalide ou a expiré. Demandez-en un nouveau.",
  profil: "Votre compte n'a pas de profil valide. Reconnectez-vous ; si le problème persiste, contactez l'administrateur.",
};

// Photo d'intervention plein écran (public/login-bg.jpg), détectée au démarrage du serveur.
const BG_FILE = "login-bg.jpg";
const HAS_BG = existsSync(path.join(process.cwd(), "public", BG_FILE));

/**
 * Écran de connexion « affiche » : photo assombrie à 55 %, logo en haut à gauche,
 * champ et bouton en verre en bas. Aucune tagline.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erreur?: string }> }) {
  const { next = "/", erreur } = await searchParams;
  const domains = getAllowedDomains();

  return (
    <main className="relative flex min-h-dvh flex-col bg-bg-0">
      {HAS_BG && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- photo de fond statique */}
          <img src={`/${BG_FILE}`} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
          <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
        </>
      )}

      {/* Mobile : logo centré dans le tiers haut de la photo ; desktop : en haut à gauche */}
      <header className="absolute inset-x-0 top-[18%] flex justify-center sm:inset-x-auto sm:left-8 sm:top-8 sm:block">
        <Logo height={52} className="sm:!h-11" />
        <h1 className="sr-only">{APP_NAME}</h1>
      </header>

      <div className="relative flex flex-1 flex-col justify-center px-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:mx-auto sm:w-full sm:max-w-[420px]">
        <section className="glass rounded-[22px] p-5 sm:p-6">
          {erreur && ERRORS[erreur] && (
            <p role="alert" className="mb-4 text-[15px] text-red-text">
              {ERRORS[erreur]}
            </p>
          )}
          <LoginForm next={next} domains={domains} />
        </section>
      </div>
    </main>
  );
}
