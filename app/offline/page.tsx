import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { OfflineFeed } from "@/components/feed/OfflineFeed";

export const metadata: Metadata = { title: "Hors ligne" };

/** Page servie par le service worker quand le réseau est indisponible. */
export default function OfflinePage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[680px] bg-bg-0 px-3 pb-10 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-8">
      <div className="flex h-12 items-center px-1">
        <Logo height={22} />
      </div>
      <OfflineFeed />
    </main>
  );
}
