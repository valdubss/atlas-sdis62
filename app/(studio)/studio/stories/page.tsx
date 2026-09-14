import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Stories" };

export default function Page() {
  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Stories</h1>
      <div className="rounded-[16px] bg-bg-1">
        <EmptyState title="Bientôt disponible" description="Éditeur de stories, archive et à-la-une." />
      </div>
    </div>
  );
}
