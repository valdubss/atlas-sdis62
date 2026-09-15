import { redirect } from "next/navigation";

/** Adresse courte de fiche : la page complète du centre fait office de fiche. */
export default async function DirectoryCenterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/centre/${slug}`);
}
