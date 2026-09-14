import type { Metadata } from "next";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Modération" };

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionTitle>Modération</SectionTitle>
      <Card>
        <EmptyState title="Bientôt disponible" description="Signalements des agents et commentaires masqués : lot e." />
      </Card>
    </div>
  );
}
