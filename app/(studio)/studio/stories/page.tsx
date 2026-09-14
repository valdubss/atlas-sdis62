import type { Metadata } from "next";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Stories" };

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionTitle>Stories</SectionTitle>
      <Card>
        <EmptyState title="Bientôt disponible" description="Éditeur de stories, archive et à-la-une : lot d." />
      </Card>
    </div>
  );
}
