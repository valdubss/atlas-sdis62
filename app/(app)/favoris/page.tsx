import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Favoris" };

export default function FavorisPage() {
  return (
    <div className="space-y-6">
      <SectionTitle>Favoris</SectionTitle>
      {/* Lot (b/f) : posts enregistrés par l'utilisateur */}
      <EmptyState
        title="Aucun favori"
        description="Enregistrez une publication depuis le fil pour la retrouver ici."
      />
    </div>
  );
}
