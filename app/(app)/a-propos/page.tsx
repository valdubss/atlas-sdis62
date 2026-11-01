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
        <div className="mt-2 space-y-2 text-[15px] text-text-2">
          <p>
            Le {ORG_LONG_NAME} est responsable du traitement. {APP_NAME} sert à l&apos;information interne des agents, dans le
            cadre des missions du service (article 6.1.e du RGPD). Le service communication en assure la gestion.
          </p>
          <p>
            <span className="font-medium text-text-1">Données enregistrées :</span> nom, prénom, matricule, statut (SPV, SPP, JSP,
            personnel administratif et technique), centre ou service, adresse e-mail du SDIS, adresse e-mail personnelle si vous
            l&apos;avez indiquée, photo de profil facultative, publications, commentaires, réactions et réglages de notification.
          </p>
          <p>
            L&apos;adresse e-mail personnelle n&apos;est utilisée que pour vous envoyer les codes de connexion et de mot de passe
            oublié, et les e-mails que vous avez activés dans vos réglages. Elle n&apos;apparaît jamais dans l&apos;annuaire ni
            auprès des autres agents. Votre fonction, votre téléphone professionnel et votre présence dans l&apos;annuaire ne sont
            affichés que si vous l&apos;avez choisi dans Profil → Mon centre, et se retirent d&apos;un geste. La carte des centres ne
            demande votre position qu&apos;au toucher de « Autour de moi » et ne l&apos;enregistre jamais. Aucun outil de mesure
            d&apos;audience tiers n&apos;est utilisé.
          </p>
          <p>
            Les données sont hébergées dans l&apos;Union européenne et conservées pendant la durée de votre engagement au SDIS,
            puis supprimées avec votre compte. Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et
            d&apos;opposition : vous pouvez supprimer votre compte vous-même à tout moment (Profil → « Supprimer mon compte » :
            profil, photo, adresses, réglages et traces effacés aussitôt ; commentaires et messages conservés sans votre nom),
            demander l&apos;export de vos données auprès du service communication ou du délégué à la protection des données du
            SDIS 62, et saisir la CNIL si vous estimez vos droits non respectés.
          </p>
        </div>
      </section>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Contact</h2>
        <p className="mt-2 text-[15px] text-text-2">Service communication du SDIS 62.</p>
      </section>
    </div>
  );
}
