import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";

/** Mot-symbole ATLAS : Inter 600, blanc, sans ornement. */
export function Logo({ size = 17, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("select-none font-semibold tracking-[-0.02em] text-text-1", className)}
      style={{ fontSize: size, lineHeight: 1 }}
      aria-label={APP_NAME}
    >
      {APP_NAME}
    </span>
  );
}
