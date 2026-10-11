import type { Metadata } from "next";
import { fetchDocuments } from "@/lib/documents/queries";
import { DocumentsAdmin } from "@/components/admin/DocumentsAdmin";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/** Administration → Documents : fiches réflexes et documents utiles partagés à tout le SDIS. */
export default async function AdminDocumentsPage() {
  const docs = await fetchDocuments();
  return <DocumentsAdmin docs={docs} />;
}
