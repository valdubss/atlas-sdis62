import { Ecg } from "./Ecg";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";

/**
 * Logo typographique ATLAS : capitales condensées blanches, espacement large,
 * fine impulsion ECG rouge en signature (optionnelle).
 */
export function Logo({
  height = 28,
  className,
  signature = true,
}: {
  height?: number;
  className?: string;
  signature?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-2 font-display font-extrabold uppercase leading-none tracking-[0.18em] text-white",
        className,
      )}
      style={{ fontSize: height }}
      aria-label={APP_NAME}
    >
      <span>{APP_NAME}</span>
      {signature && <Ecg className="h-[0.55em] w-[1.9em] text-red" strokeWidth={2.4} />}
    </span>
  );
}
