import type { Metadata } from "next";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EcgDivider } from "@/components/brand/Ecg";
import { APP_NAME, ORG_LONG_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "À propos" };

export default function AProposPage() {
  return (
    <div className="space-y-6">
      <SectionTitle>À propos</SectionTitle>

      <Card className="space-y-4 p-5 text-sm leading-relaxed text-body">
        <p>
          <strong className="text-ink">{APP_NAME}</strong> est la plateforme d&apos;actualités
          interne du {ORG_LONG_NAME}. Elle est éditée par le service communication.
        </p>
        <EcgDivider />
        <h3 className="font-display text-lg font-bold uppercase text-navy">
          Charte d&apos;utilisation
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Les publications sont réservées au service communication.</li>
          <li>
            Les commentaires restent courtois et professionnels ; ils peuvent être modérés
            ou masqués.
          </li>
          <li>Les contenus sont internes : ne les diffusez pas hors du SDIS.</li>
          <li>Tout contenu inapproprié peut être signalé depuis le commentaire.</li>
        </ul>
        <EcgDivider />
        <h3 className="font-display text-lg font-bold uppercase text-navy">Données personnelles</h3>
        <p>
          Seuls votre nom, votre centre ou service et une photo de profil facultative sont
          enregistrés. Aucun outil de mesure d&apos;audience tiers n&apos;est utilisé. Vous
          pouvez demander l&apos;export ou la suppression de votre compte auprès du service
          communication.
        </p>
        <EcgDivider />
        <h3 className="font-display text-lg font-bold uppercase text-navy">Contact</h3>
        <p>Service communication du SDIS 62 — à compléter par l&apos;administrateur.</p>
      </Card>
    </div>
  );
}
