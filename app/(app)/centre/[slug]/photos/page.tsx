import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchCenterBySlug } from "@/lib/centres/public";
import { fetchCenterAlbums } from "@/lib/centres/albums";
import { CenterAlbums } from "@/components/centre/CenterAlbums";
import { TopBar } from "@/components/layout/TopBar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const center = await fetchCenterBySlug(slug);
  return { title: center ? `Albums · ${center.name}` : "Albums" };
}

/** Albums photo d'un centre : toutes ses publications photo, téléchargeables. */
export default async function CenterPhotosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const center = await fetchCenterBySlug(slug);
  if (!center) notFound();
  const albums = await fetchCenterAlbums(center.id);
  return (
    <div className="space-y-3">
      <TopBar
        title="Albums photo"
        leading={
          <Link href={`/centre/${slug}`} className="pressable -ml-2 flex h-12 items-center pr-2 text-[15px] font-medium text-text-2 hover:text-text-1">
            {center.name}
          </Link>
        }
      />
      <CenterAlbums albums={albums} />
    </div>
  );
}
