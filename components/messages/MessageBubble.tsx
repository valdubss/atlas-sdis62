"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Pause, Play, Pin } from "lucide-react";
import type { Message, MessageMedia, MessageVoice } from "@/lib/messages/types";
import { authorColor, formatDuration, mediaGrid, type BubblePosition } from "@/lib/messages/helpers";
import { mediaUrl } from "@/lib/media/url";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Coins : 18 px, réduit à 6 px côté auteur entre bulles consécutives. */
function corners(mine: boolean, pos: BubblePosition) {
  const side = mine ? "r" : "l";
  const top = pos === "middle" || pos === "last";
  const bottom = pos === "middle" || pos === "first";
  return cn("rounded-[18px]", top && (side === "r" ? "rounded-tr-[6px]" : "rounded-tl-[6px]"), bottom && (side === "r" ? "rounded-br-[6px]" : "rounded-bl-[6px]"));
}

/**
 * Bulle de message : texte, grille de médias, vocal, fichier, citation de
 * réponse, réactions ; appui long → actions. Les bulles de l'agent sont à
 * droite (bg-2), les autres à gauche (bg-1) avec nom coloré.
 */
export function MessageBubble({
  m,
  mine,
  pos,
  showName,
  onLongPress,
  onOpenMedia,
  onJumpTo,
  receipt,
}: {
  m: Message;
  mine: boolean;
  pos: BubblePosition;
  showName: boolean;
  onLongPress: (m: Message, anchor: DOMRect) => void;
  onOpenMedia: (m: Message, index: number) => void;
  onJumpTo?: (id: string) => void;
  receipt?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);

  function down() {
    moved.current = false;
    timer.current = setTimeout(() => {
      if (!moved.current && ref.current) onLongPress(m, ref.current.getBoundingClientRect());
    }, 420);
  }
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
  }

  if (m.type === "system") {
    return (
      <div className="flex justify-center px-6 py-1">
        <span className="rounded-full bg-bg-1 px-3 py-1 text-center text-[12px] text-text-3">{m.body}</span>
      </div>
    );
  }

  const name = m.author ? `${m.author.first_name} ${m.author.last_name}`.trim() : "Agent supprimé";
  const deleted = Boolean(m.deleted_at);

  return (
    <div className={cn("flex items-end gap-2 px-3", mine ? "justify-end" : "justify-start", pos === "first" || pos === "single" ? "mt-2" : "mt-0.5")} id={`msg-${m.id}`}>
      {!mine && <span className="w-8 shrink-0">{(pos === "last" || pos === "single") && <Avatar name={name} avatarKey={m.author?.avatar_key} size="sm" />}</span>}
      <div
        ref={ref}
        onPointerDown={down}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerMove={() => {
          moved.current = true;
          cancel();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (ref.current) onLongPress(m, ref.current.getBoundingClientRect());
        }}
        className={cn("relative max-w-[78%] select-none px-3 py-2 text-[15px] leading-[1.35] text-text-1", corners(mine, pos), mine ? "bg-bg-2" : "bg-bg-1", m.pending && "opacity-60", m.failed && "ring-1 ring-red")}
      >
        {showName && !mine && (
          <p className="mb-0.5 text-[12px] font-semibold" style={{ color: authorColor(m.author?.id) }}>
            {name}
          </p>
        )}
        {m.pinned_at && !deleted && (
          <span className="absolute -top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-bg-0 text-text-3" aria-label="Épinglé">
            <Pin size={12} strokeWidth={1.75} />
          </span>
        )}
        {m.reply_to && !deleted && (
          <button type="button" onClick={() => onJumpTo?.(m.reply_to!.id)} className="mb-1.5 block w-full rounded-[10px] border-l-2 border-navy-link bg-bg-0/60 px-2.5 py-1.5 text-left">
            <span className="block text-[12px] font-semibold text-navy-link">{m.reply_to.author}</span>
            <span className="block truncate text-[13px] text-text-2">{m.reply_to.body ?? (m.reply_to.type === "voice" ? "Message vocal" : m.reply_to.has_media ? "Photo ou fichier" : "Message supprimé")}</span>
          </button>
        )}
        {deleted ? (
          <p className="italic text-text-3">Message supprimé</p>
        ) : (
          <>
            {m.media && m.media.length > 0 && <MediaGrid media={m.media} onOpen={(i) => onOpenMedia(m, i)} />}
            {m.voice && <VoiceBubble voice={m.voice} mine={mine} />}
            {m.body && <p className="whitespace-pre-wrap break-words">{renderBody(m.body)}</p>}
          </>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-text-3">
          {m.failed ? <span className="text-red-text">Échec · réessayer</span> : m.queued ? "En attente du réseau" : m.pending ? "Envoi…" : (pos === "last" || pos === "single") && time(m.created_at)}
        </span>
        {m.reactions.length > 0 && (
          <span className={cn("absolute -bottom-3 flex gap-1", mine ? "left-2" : "right-2")}>
            {m.reactions.map((r) => (
              <span key={r.emoji} className={cn("flex h-[22px] items-center gap-0.5 rounded-full border border-bg-0 bg-bg-1 px-1.5 text-[12px]", r.mine && "ring-1 ring-text-1")}>
                {r.emoji}
                {r.count > 1 && <span className="tabular-nums text-text-2">{r.count}</span>}
              </span>
            ))}
          </span>
        )}
      </div>
      {mine && receipt}
    </div>
  );
}

/** Mentions « @Prénom » et liens http mis en évidence. */
function renderBody(body: string) {
  const parts = body.split(/(@tous\b|@[\p{L}][\p{L}'-]*(?: [\p{L}][\p{L}'-]*)?|https?:\/\/\S+)/u);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p))
      return (
        <a key={i} href={p} target="_blank" rel="noreferrer" className="text-navy-link underline">
          {p}
        </a>
      );
    if (/^@/.test(p))
      return (
        <span key={i} className="font-semibold text-navy-link">
          {p}
        </span>
      );
    return p;
  });
}

/** Grille : 1 → plein, 2 → deux colonnes, ≥ 3 → 2×2 avec « +N » sur la dernière. */
function MediaGrid({ media, onOpen }: { media: MessageMedia[]; onOpen: (index: number) => void }) {
  const { shown, extra, cols } = mediaGrid(media);
  const files = media.filter((m) => m.kind === "file");
  const visuals = shown.filter((m) => m.kind !== "file");
  return (
    <div className="-mx-1 mb-1 space-y-1">
      {visuals.length > 0 && (
        <div className={cn("grid gap-1 overflow-hidden rounded-[12px]", cols === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {visuals.map((v, i) => {
            const idx = media.indexOf(v);
            const last = i === visuals.length - 1 && extra > 0;
            return (
              <button key={v.key} type="button" onClick={() => onOpen(idx)} className={cn("relative block overflow-hidden bg-bg-0", cols === 1 ? "max-h-[360px]" : "aspect-square")} aria-label={v.kind === "video" ? "Ouvrir la vidéo" : "Ouvrir la photo"}>
                {/* eslint-disable-next-line @next/next/no-img-element -- pièce jointe */}
                <img src={mediaUrl(v.kind === "video" ? (v.poster_key ?? v.key) : v.key)} alt="" loading="lazy" className={cn("h-full w-full object-cover", cols === 1 && "max-h-[360px] w-auto max-w-full")} style={cols === 1 && v.width && v.height ? { aspectRatio: `${v.width} / ${v.height}` } : undefined} />
                {v.kind === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play size={20} strokeWidth={1.75} fill="currentColor" />
                    </span>
                  </span>
                )}
                {last && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[20px] font-semibold text-white">+{extra}</span>}
              </button>
            );
          })}
        </div>
      )}
      {files.map((f) => (
        <FileCard key={f.key} f={f} />
      ))}
    </div>
  );
}

function FileCard({ f }: { f: MessageMedia }) {
  const size = f.size ? (f.size > 1_048_576 ? `${(f.size / 1_048_576).toFixed(1)} Mo` : `${Math.round(f.size / 1024)} Ko`) : "";
  return (
    <a href={mediaUrl(f.key)} target="_blank" rel="noreferrer" download={f.name} className="flex items-center gap-3 rounded-[12px] bg-bg-0/60 px-3 py-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2">
        <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-text-1">{f.name ?? "Fichier"}</span>
        <span className="block text-[12px] text-text-3">
          {f.mime === "application/pdf" ? "PDF" : "Word"}
          {size && ` · ${size}`}
        </span>
      </span>
    </a>
  );
}

/** Message vocal : lecture, forme d'onde 64 barres, vitesse 1× / 1,5× / 2×. */
function VoiceBubble({ voice, mine }: { voice: MessageVoice; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);
  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => {});
  }
  const bars = voice.waveform.length ? voice.waveform : Array(64).fill(0.3);
  return (
    <div className="flex w-[240px] max-w-full items-center gap-2 py-1">
      <audio ref={audio} src={mediaUrl(voice.key)} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setProgress(0)} onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} />
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Écouter"} className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", mine ? "bg-bg-0 text-text-1" : "bg-bg-2 text-text-1")}>
        {playing ? <Pause size={16} strokeWidth={2} fill="currentColor" /> : <Play size={16} strokeWidth={2} fill="currentColor" />}
      </button>
      <span className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden="true">
        {bars.map((v, i) => (
          <span key={i} className={cn("w-[2px] rounded-full", i / bars.length <= progress ? "bg-text-1" : "bg-text-4")} style={{ height: `${Math.max(3, v * 28)}px` }} />
        ))}
      </span>
      <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-text-3">{formatDuration(voice.duration_s)}</span>
      <button type="button" onClick={() => setRate((r) => (r === 1 ? 1.5 : r === 1.5 ? 2 : 1))} className="shrink-0 rounded-full bg-bg-0/60 px-1.5 text-[11px] font-semibold tabular-nums text-text-2" aria-label={`Vitesse ${rate}`}>
        {rate}×
      </button>
    </div>
  );
}
