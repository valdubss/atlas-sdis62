import Link from "next/link";
import { MapPin } from "lucide-react";
import type { LiveEntry, LiveItem } from "@/lib/direct/types";
import { imageSrc } from "@/lib/media/url";
import { LivePlayer } from "./LivePlayer";

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * Carte du Direct épinglée en première position du fil : vidéo si le direct en a une,
 * sinon en-tête rouge ; les trois dernières entrées ; accès au fil complet.
 */
export function LiveCard({ live, entries }: { live: LiveItem; entries: LiveEntry[] }) {
  const latest = entries.slice(0, 3);
  return (
    <article className="overflow-hidden rounded-[22px] bg-bg-1 ring-1 ring-red-fill/40" aria-label={`En direct : ${live.title}`}>
      {live.video ? (
        <LivePlayer active compact />
      ) : (
        <div className="flex items-center gap-2 bg-red-fill px-4 py-2 text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em]">En direct</span>
        </div>
      )}
      <div className="space-y-3 px-4 pb-4 pt-3">
        <div>
          <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-text-1">{live.title}</h2>
          {(live.location || live.center) && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-text-3">
              <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
              {[live.location, live.center?.name].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {latest.length > 0 && (
          <ol className="space-y-2">
            {latest.map((e) => (
              <li key={e.id} className="flex gap-3 text-[15px]">
                <time dateTime={e.created_at} className="shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums text-text-3">
                  {time.format(new Date(e.created_at))}
                </time>
                <span className="min-w-0 flex-1">
                  {e.body && <span className="line-clamp-2 text-text-1">{e.body}</span>}
                  {e.media?.kind === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element -- variantes WebP maison
                    <img src={imageSrc(e.media, "small")} alt={e.media.alt} loading="lazy" decoding="async" className="mt-1.5 h-20 w-28 rounded-[10px] object-cover" />
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        <Link href={`/direct/${live.id}`} className="pressable inline-flex h-11 items-center justify-center rounded-[12px] bg-red-fill px-4 text-[15px] font-semibold text-white">
          Suivre le direct
        </Link>
      </div>
    </article>
  );
}
