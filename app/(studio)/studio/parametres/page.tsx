import type { Metadata } from "next";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Paramètres" };

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionTitle>Paramètres</SectionTitle>
      <Card>
        <EmptyState title="Bientôt disponible" description="Catégories, centres, utilisateurs et notifications : lot e." />
      </Card>
    </div>
  );
}
