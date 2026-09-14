import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;
  const current = await getCurrentUser();
  const firstName = current?.profile.first_name;

  return (
    <div className="space-y-6">
      {erreur === "acces-studio" && (
        <p role="alert" className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-body">
          Le studio est réservé au service communication.
        </p>
      )}
      <div>
        <SectionTitle>Fil d&apos;actualités</SectionTitle>
        {firstName && <p className="mt-1 text-sm text-muted">Bonjour {firstName}.</p>}
      </div>
      {/* Lot (b) : stories, posts épinglés, fil infini, filtres */}
      <EmptyState
        title="Aucune actualité pour le moment"
        description="Les publications du service communication apparaîtront ici."
      />
    </div>
  );
}
