import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { EcgDivider } from "@/components/brand/Ecg";
import { APP_NAME, APP_TAGLINE, ORG_LONG_NAME } from "@/lib/config";
import { getAllowedDomains } from "@/lib/auth/domains";
import { getAuthProviders } from "@/lib/auth/providers";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  desactive: "Votre compte a été désactivé. Contactez le service communication.",
  lien: "Ce lien de connexion est invalide ou a expiré. Demandez-en un nouveau.",
  profil: "Votre compte n'a pas de profil valide. Reconnectez-vous ; si le problème persiste, contactez l'administrateur.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erreur?: string }>;
}) {
  const { next = "/", erreur } = await searchParams;
  const domains = getAllowedDomains();
  const sso = getAuthProviders().find((p) => p.id === "azure" && p.enabled);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo height={44} />
          <h1 className="sr-only">{APP_NAME}</h1>
          <p className="text-sm text-muted">{APP_TAGLINE}</p>
        </div>

        <div className="glass rounded-card p-6 shadow-soft">
          {erreur && ERRORS[erreur] && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red/30 bg-red/5 px-3 py-2 text-sm text-red-text"
            >
              {ERRORS[erreur]}
            </p>
          )}
          <LoginForm next={next} domains={domains} />
          {sso && (
            <>
              <EcgDivider className="my-6" />
              <p className="text-center text-sm text-muted">{sso.label} : bientôt disponible.</p>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted">{ORG_LONG_NAME}</p>
      </div>
    </main>
  );
}
