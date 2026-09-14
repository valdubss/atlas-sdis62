import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { APP_NAME } from "@/lib/config";

export function TopBar({ showStudio }: { showStudio: boolean }) {
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3" aria-label={`${APP_NAME} — accueil`}>
          <Logo height={24} />
        </Link>
        {showStudio && (
          <Link
            href="/studio"
            className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink hover:bg-surface-2"
          >
            Studio
          </Link>
        )}
      </div>
    </header>
  );
}
