import type { Metadata } from "next";
import { APP_NAME, ORG_LONG_NAME } from "@/lib/config";
import { BackBar } from "@/components/layout/BackBar";
import { LargeTitle } from "@/components/layout/TopBar";

export const metadata: Metadata = { title: "À propos" };

export default function AProposPage() {
  return (
    <div className="space-y-3">
      <BackBar title="À propos" href="/profil" />
      <LargeTitle>À propos</LargeTitle>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4 text-[15px] text-text-1">
        <p>
          {APP_NAME} est la plateforme d&apos;actualités interne du {ORG_LONG_NAME}. Elle est éditée par le service communication.
        </p>
      </section>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Charte d&apos;utilisation</h2>
        <ul className="mt-2 space-y-2 text-[15px] text-text-2">
          <li>Les publications sont réservées au service communication.</li>
          <li>Les commentaires restent courtois et professionnels ; ils peuvent être modérés ou masqués.</li>
          <li>Les contenus sont internes : ne les diffusez pas hors du SDIS.</li>
          <li>Tout contenu inapproprié peut être signalé depuis le commentaire.</li>
        </ul>
      </section>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Données personnelles</h2>
        <p className="mt-2 text-[15px] text-text-2">
          Seuls votre nom, votre centre ou service et une photo de profil facultative sont enregistrés. Votre fonction, votre
          téléphone professionnel et votre présence dans l&apos;annuaire ne sont affichés que si vous l&apos;avez choisi dans
          Profil → Mon centre, et se retirent d&apos;un geste. La carte des centres ne demande votre position qu&apos;au toucher
          de « Autour de moi » et ne l&apos;enregistre jamais. Aucun outil de mesure d&apos;audience tiers n&apos;est utilisé.
          Vous pouvez demander l&apos;export ou la suppression de votre compte auprès du service communication.
        </p>
      </section>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Contact</h2>
        <p className="mt-2 text-[15px] text-text-2">Service communication du SDIS 62.</p>
      </section>
    </div>
  );
}
