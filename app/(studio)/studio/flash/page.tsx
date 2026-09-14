import type { Metadata } from "next";
import { fetchFlashesStudio } from "@/lib/flash/queries";
import { FlashPanel } from "@/components/studio/FlashPanel";

export const metadata: Metadata = { title: "Flash" };
export const dynamic = "force-dynamic";

export default async function StudioFlashPage() {
  const flashes = await fetchFlashesStudio();
  return <FlashPanel flashes={flashes} />;
}
