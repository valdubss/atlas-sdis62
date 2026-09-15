import { Users } from "lucide-react";
import { mediaUrl } from "@/lib/media/url";
import { mosaicLayout } from "@/lib/messages/helpers";
import { cn } from "@/lib/cn";

type Person = { name: string; avatar_key: string | null };

function Face({ p, className }: { p: Person; className?: string }) {
  const initials = p.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");
  return p.avatar_key ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatar
    <img src={mediaUrl(p.avatar_key)} alt="" className={cn("h-full w-full object-cover", className)} />
  ) : (
    <span className={cn("flex h-full w-full items-center justify-center bg-bg-2 text-[11px] font-semibold text-text-2", className)}>{initials || "?"}</span>
  );
}

/**
 * Avatar d'une conversation : photo du groupe si définie, sinon mosaïque de
 * 1 à 4 membres (rond 52 px), sinon icône de groupe.
 */
export function AvatarMosaic({ photoKey, people, size = 52, className }: { photoKey?: string | null; people: Person[]; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (photoKey) {
    return (
      <span className={cn("block shrink-0 overflow-hidden rounded-full bg-bg-2", className)} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element -- photo de groupe */}
        <img src={mediaUrl(photoKey)} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  const layout = mosaicLayout(people.length);
  if (people.length === 0) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-bg-2 text-text-3", className)} style={style}>
        <Users size={Math.round(size * 0.42)} strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={cn("block shrink-0 overflow-hidden rounded-full bg-bg-2", className)} style={style} aria-hidden="true">
      {layout === "one" && <Face p={people[0]} />}
      {layout === "two" && (
        <span className="grid h-full w-full grid-cols-2 gap-px">
          <Face p={people[0]} />
          <Face p={people[1]} />
        </span>
      )}
      {layout === "three" && (
        <span className="grid h-full w-full grid-cols-2 gap-px">
          <span className="row-span-2 overflow-hidden">
            <Face p={people[0]} />
          </span>
          <span className="overflow-hidden">
            <Face p={people[1]} />
          </span>
          <span className="overflow-hidden">
            <Face p={people[2]} />
          </span>
        </span>
      )}
      {layout === "four" && (
        <span className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px">
          {people.slice(0, 4).map((p, i) => (
            <span key={i} className="overflow-hidden">
              <Face p={p} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
