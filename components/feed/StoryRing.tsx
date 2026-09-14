import { cn } from "@/lib/cn";

/**
 * Anneau de story : cercle 64 px, anneau 2 px --red si non vue, --line si vue,
 * vignette avec 3 px de retrait. Pas de dégradé.
 */
export function StoryRing({
  label,
  src,
  seen = false,
  className,
}: {
  label: string;
  src?: string | null;
  seen?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex w-[72px] flex-col items-center gap-1.5", className)}>
      <span
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border-2",
          seen ? "border-glass-edge" : "border-red",
        )}
      >
        <span className="h-[54px] w-[54px] overflow-hidden rounded-full bg-bg-2">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- vignette légère
            <img src={src} alt="" className="h-full w-full object-cover" />
          )}
        </span>
      </span>
      <span className="w-full truncate text-center text-[11px] font-medium text-text-2">{label}</span>
    </span>
  );
}
