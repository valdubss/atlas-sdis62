import { cn } from "@/lib/cn";

/**
 * Tracé d'électrocardiogramme, motif signature repris du logo SDIS 62.
 * Utilisé en séparateur, indicateur de chargement (animate) et état vide.
 */
export function Ecg({
  className,
  animate = false,
  strokeWidth = 2.5,
}: {
  className?: string;
  animate?: boolean;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 240 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("block", className)}
      preserveAspectRatio="none"
    >
      <path
        d="M0 20 H62 L70 20 L76 12 L82 28 L88 20 H112 L120 20 L128 2 L136 38 L144 20 H240"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className={animate ? "ecg-animate" : undefined}
      />
    </svg>
  );
}

/** Séparateur de section : ligne fine grise terminée par le tracé rouge. */
export function EcgDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <Ecg className="h-5 w-24 text-red" strokeWidth={2} />
    </div>
  );
}

/** Indicateur de chargement : le tracé se dessine en boucle. */
export function EcgLoader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8" role="status" aria-live="polite">
      <Ecg className="h-8 w-40 text-red" animate />
      <span className="sr-only">{label}</span>
    </div>
  );
}
