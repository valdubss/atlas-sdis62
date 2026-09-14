import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Galerie" };

export default function GaleriePage() {
  return (
    <div className="space-y-3">
      <PageHeader title="Galerie" />
      {/* Lot f : grille de toutes les photos publiées, lightbox */}
      <EmptyState title="Pas encore de photos" description="La galerie rassemble toutes les photos publiées dans le fil." />
    </div>
  );
}
