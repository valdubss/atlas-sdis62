import { cn } from "@/lib/cn";

type Tone = "navy" | "red" | "muted" | "success";

const TONES: Record<Tone, string> = {
  navy: "bg-navy/10 text-navy",
  red: "bg-red text-white",
  muted: "bg-surface-2 text-muted",
  success: "bg-success/10 text-success",
};

export function Badge({
  tone = "navy",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
