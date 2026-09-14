import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * Bouton principal d'un écran du studio : libellé complet sur grand écran,
 * pastille ronde « + » sur mobile (jamais de débordement à côté du titre).
 */
export function NewButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-fill text-white sm:w-auto sm:rounded-[12px] sm:px-4 sm:text-[15px] sm:font-semibold"
    >
      <Plus size={22} strokeWidth={2} aria-hidden="true" className="sm:hidden" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
