import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media/url";

const SIZES = { xs: "h-7 w-7 text-[10px]", sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-[13px]", lg: "h-16 w-16 text-[22px]" } as const;

/** Image du Service Communication (publications officielles) : logo Pompiers 62, 256 px, fond transparent. */
const OFFICIAL_AVATAR = "/avatar-service-com.png";

/** Avatar : photo si disponible (logo Pompiers 62 pour le Service Communication), sinon initiales sur --bg-2. Jamais de fond coloré. */
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

  const src = avatarKey ? mediaUrl(avatarKey) : official ? OFFICIAL_AVATAR : null;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar léger, variante 256 px
      <img src={src} alt="" className={cn("shrink-0 rounded-full object-cover", SIZES[size], className)} />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-bg-2 font-medium text-text-2", SIZES[size], className)}
    >
      {initials}
    </span>
  );
}
