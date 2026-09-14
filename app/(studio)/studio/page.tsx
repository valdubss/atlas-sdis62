import type { Metadata } from "next";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Studio" };

export default function StudioDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionTitle>Tableau de bord</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Brouillons", 0],
          ["Programmés", 0],
          ["Publiés", 0],
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 font-display text-4xl font-extrabold text-navy">{value}</p>
          </Card>
        ))}
      </div>
      {/* Lot (e) : statistiques, top 5 de la semaine, accès rapides */}
      <Card>
        <EmptyState
          title="Le studio arrive"
          description="Éditeur de publications, stories et modération seront livrés dans les prochains lots."
        />
      </Card>
    </div>
  );
}
