import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media/url";

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-2xl" } as const;

/** Avatar : photo si disponible, sinon initiales. « SC » (marine) pour le service com. */
export function Avatar({
  name,
  avatarKey,
  size = "md",
  official = false,
  className,
}: {
  name: string | null | undefined;
  avatarKey?: string | null;
  size?: keyof typeof SIZES;
  official?: boolean;
  className?: string;
}) {
  const initials = official
    ? "SC"
    : (name ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("") || "?";

  if (avatarKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar S3 léger, variante 256 px
      <img
        src={mediaUrl(avatarKey)}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", SIZES[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display font-bold uppercase",
        official ? "bg-navy text-white" : "bg-surface-2 text-navy",
        SIZES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
