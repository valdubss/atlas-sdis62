import { cn } from "@/lib/cn";

type Tone = "neutral" | "red" | "success" | "navy";

/** Étiquette 13/500 : fond --bg-2, texte --text-2 ; rouge uniquement pour « nouveau ». */
const TONES: Record<Tone, string> = {
  neutral: "bg-bg-2 text-text-2",
  red: "bg-red-soft text-red-text",
  success: "bg-bg-2 text-success",
  navy: "bg-bg-2 text-navy-link",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[13px] font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}
