import Link from "next/link";
import { Logo, hasLogo } from "@/components/brand/Logo";
import { APP_NAME } from "@/lib/config";

export function TopBar({ showStudio }: { showStudio: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3" aria-label={`${APP_NAME} — accueil`}>
          <Logo height={36} />
          {hasLogo() && (
            <span className="font-display text-xl font-bold uppercase leading-none text-navy">
              {APP_NAME}
            </span>
          )}
        </Link>
        {showStudio && (
          <Link
            href="/studio"
            className="rounded-full border border-navy/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-navy hover:bg-navy hover:text-white"
          >
            Studio
          </Link>
        )}
      </div>
    </header>
  );
}
