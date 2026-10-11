"use client";

import { useEffect, useState, useTransition } from "react";
import { Pin, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteLiveEntry, listLiveEntries, pinLiveEntry } from "@/app/(studio)/studio/direct/actions";
import type { LiveEntry } from "@/lib/direct/types";
import { imageSrc } from "@/lib/media/url";
import { Lightbox } from "@/components/feed/Lightbox";
import dynamic from "next/dynamic";

const VideoPlayer = dynamic(() => import("@/components/feed/VideoPlayer").then((m) => m.VideoPlayer));
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { cn } from "@/lib/cn";

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/**
 * Fil minute par minute d'un Direct : entrées épinglées en tête, puis les plus récentes ;
 * mises à jour en temps réel (Supabase Realtime), galerie au tap sur une photo ; le service
 * communication peut épingler ou retirer une entrée.
 */
export function LiveTimeline({ liveId, initial, canEdit, active }: { liveId: string; initial: LiveEntry[]; canEdit: boolean; active: boolean }) {
  const [entries, setEntries] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => setEntries(initial), [initial]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => listLiveEntries(liveId).then(setEntries).catch(() => {}), 250);
    };
    const channel = supabase
      .channel(`live-entries:${liveId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_entries", filter: `live_id=eq.${liveId}` }, reload)
      .subscribe();
    // Filet : relecture toutes les 30 s pendant le direct (temps réel indisponible hors ligne)
    const poll = active ? setInterval(reload, 30_000) : null;
    return () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [liveId, active]);

  if (entries.length === 0) {
    return <p className="rounded-[16px] bg-bg-1 px-4 py-5 text-center text-[15px] text-text-2">{active ? "Le direct vient de commencer, premières informations dans un instant." : "Aucune entrée."}</p>;
  }

  const photos = entries.filter((e) => e.media?.kind === "image");

  return (
    <ol className="space-y-2" aria-live="polite">
      {entries.map((e) => (
        <li key={e.id} className={cn("rounded-[16px] bg-bg-1 p-4", e.pinned && "ring-1 ring-red-fill/50")}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] text-text-3">
              <time dateTime={e.created_at} className="font-semibold tabular-nums text-text-1">
                {time.format(new Date(e.created_at))}
              </time>
              {e.pinned && (
                <span className="flex items-center gap-1 text-red-text">
                  <Pin size={12} strokeWidth={2} aria-hidden="true" /> Épinglé
                </span>
              )}
            </span>
            {canEdit && (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => void (await pinLiveEntry(e.id, !e.pinned)))}
                  aria-label={e.pinned ? "Désépingler" : "Épingler"}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:text-text-1"
                >
                  <Pin size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    confirm({ title: "Retirer cette entrée ?", confirmLabel: "Retirer", danger: true }).then((ok) => {
                      if (!ok) return;
                      start(async () => {
                        const r = await deleteLiveEntry(e.id);
                        if (!r.ok) toast(r.error);
                      });
                    })
                  }
                  aria-label="Retirer l'entrée"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:text-red-text"
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          {e.body && <p className="mt-1.5 whitespace-pre-line text-[16px] leading-[1.45] text-text-1">{e.body}</p>}
          {e.media?.kind === "video" && (
            <div className="mt-3 overflow-hidden rounded-[12px]">
              <VideoPlayer media={e.media} autoplay={false} rounded={false} />
            </div>
          )}
          {e.media?.kind === "image" && (
            <button type="button" onClick={() => setOpen(e.media!.id)} className="mt-3 block w-full overflow-hidden rounded-[12px] bg-bg-2" aria-label="Agrandir la photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- variantes WebP maison */}
              <img src={imageSrc(e.media, "medium")} alt={e.media.alt} loading="lazy" decoding="async" className="max-h-[420px] w-full object-cover" />
            </button>
          )}
        </li>
      ))}
      <Lightbox
        open={open !== null}
        items={photos.map((e) => ({ src: imageSrc(e.media!, "full"), alt: e.media!.alt }))}
        index={Math.max(0, photos.findIndex((e) => e.media!.id === open))}
        onClose={() => setOpen(null)}
      />
    </ol>
  );
}
