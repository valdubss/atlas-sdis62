import type { Metadata } from "next";
import { fetchDocuments } from "@/lib/documents/queries";
import { DocumentsList } from "@/components/documents/DocumentsList";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/** Documents utiles : fiches réflexes, procédures, formulaires ; gardés hors ligne à la demande. */
export default async function DocumentsPage() {
  const docs = await fetchDocuments();
  return (
    <div className="space-y-3">
      <PageHeader title="Documents" />
      <DocumentsList docs={docs} />
    </div>
  );
}
