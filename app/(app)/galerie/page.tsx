import type { Metadata } from "next";
import { fetchGallery } from "@/lib/feed/queries";
import { GalleryGrid } from "@/components/feed/GalleryGrid";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Galerie" };
export const dynamic = "force-dynamic";

export default async function GaleriePage() {
  const items = await fetchGallery();
  return (
    <div className="space-y-3">
      <PageHeader title="Galerie" />
      <GalleryGrid initial={items} />
    </div>
  );
}
