import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "tertiary" | "danger";
type Size = "sm" | "md" | "lg";

/**
 * Principal : plein --red-fill, 48 px, rayon 12 px — un seul par écran.
 * Secondaire : --bg-2 texte --text-1. Tertiaire : texte seul.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-red-fill text-white rounded-[12px]",
  secondary: "bg-bg-2 text-text-1 rounded-[10px]",
  tertiary: "bg-transparent text-text-2 hover:text-text-1 rounded-[10px]",
  danger: "bg-transparent text-red-text rounded-[10px]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-5 text-[15px]",
};

export function Button({
  variant = "primary",
  size = variant === "primary" ? "lg" : "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-[1.75px] border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
