"use client";

import { useRef, useState } from "react";
import type { MediaItem, StoryOverlay } from "@/lib/feed/types";
import { StoryMedia } from "@/components/stories/StoryMedia";
import { MASKED_ZONES, relFromPointer, snapToVisible } from "@/lib/stories/overlay";
import { cn } from "@/lib/cn";

export type PreviewPoll = { question: string; options: string[]; x: number; y: number };
export type PreviewQuestion = { prompt: string; x: number; y: number };
type Draggable = "text" | "poll" | "question";

/**
 * Aperçu 9:16 du Studio : zones masquées par l'interface hachurées, texte,
 * sondage et question déplaçables au doigt (positions relatives 0–1).
 */
export function StoryPreview({
  media,
  title,
  text,
  textPos,
  poll,
  question,
  onMove,
}: {
  media: MediaItem | null;
  title: string;
  text: string;
  textPos: { x: number; y: number };
  poll: PreviewPoll | null;
  question: PreviewQuestion | null;
  onMove: (what: Draggable, pos: { x: number; y: number }) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Draggable | null>(null);

  function start(what: Draggable) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(what);
    };
  }
  function move(e: React.PointerEvent) {
    if (!dragging || !frame.current) return;
    const { x, y } = relFromPointer(frame.current.getBoundingClientRect(), e.clientX, e.clientY);
    onMove(dragging, { x, y });
  }
  function end(e: React.PointerEvent) {
    if (!dragging || !frame.current) return;
    const { x, y } = relFromPointer(frame.current.getBoundingClientRect(), e.clientX, e.clientY);
    onMove(dragging, { x, y: snapToVisible(y) });
    setDragging(null);
  }

  const overlay: StoryOverlay = text ? { text, x: textPos.x, y: textPos.y } : null;
  const handle = (what: Draggable, active: boolean) =>
    cn("absolute -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab select-none rounded-[14px] outline-dashed outline-1 outline-white/60 active:cursor-grabbing", active && "outline-2 outline-white");

  return (
    <div className="mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[28px] bg-black ring-[6px] ring-bg-2">
      <div ref={frame} className="relative h-full" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <StoryMedia media={media} overlay={null} playing={false} />

        {/* Zones masquées par l'interface (barres, en-tête, réactions) */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.18)_0_6px,transparent_6px_14px)]" style={{ height: `${MASKED_ZONES.top * 100}%` }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.18)_0_6px,transparent_6px_14px)]" style={{ height: `${MASKED_ZONES.bottom * 100}%` }} />

        {/* Chrome du viewer : barre de progression et titre */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex gap-1" aria-hidden="true">
          <span className="h-[2px] flex-1 rounded-full bg-white/30">
            <span className="block h-full w-1/3 rounded-full bg-white" />
          </span>
        </div>
        <p className="pointer-events-none absolute left-3 top-6 text-[13px] font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">{title}</p>

        {overlay?.text && (
          <div role="button" tabIndex={0} aria-label="Déplacer le texte" onPointerDown={start("text")} className={cn(handle("text", dragging === "text"), "w-[88%] px-2 py-1")} style={{ left: `${textPos.x * 100}%`, top: `${textPos.y * 100}%` }}>
            <p className="whitespace-pre-line text-center text-[18px] font-semibold leading-[1.2] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{overlay.text}</p>
          </div>
        )}
        {poll && (
          <div role="button" tabIndex={0} aria-label="Déplacer le sondage" onPointerDown={start("poll")} className={cn(handle("poll", dragging === "poll"), "w-[80%] rounded-[14px] bg-white/95 p-2.5 text-text-1")} style={{ left: `${poll.x * 100}%`, top: `${poll.y * 100}%` }}>
            <p className="mb-1.5 text-center text-[13px] font-semibold leading-[1.25]">{poll.question || "Votre question"}</p>
            <div className="space-y-1">
              {(poll.options.length ? poll.options : ["Réponse 1", "Réponse 2"]).map((o, i) => (
                <div key={i} className="h-8 truncate rounded-[8px] bg-bg-2 px-2.5 text-[12px] font-medium leading-8">
                  {o}
                </div>
              ))}
            </div>
          </div>
        )}
        {question && (
          <div role="button" tabIndex={0} aria-label="Déplacer la question" onPointerDown={start("question")} className={cn(handle("question", dragging === "question"), "w-[80%] rounded-[14px] bg-white/95 p-2.5 text-text-1")} style={{ left: `${question.x * 100}%`, top: `${question.y * 100}%` }}>
            <p className="mb-1.5 text-center text-[13px] font-semibold leading-[1.25]">{question.prompt || "Votre question"}</p>
            <div className="h-8 rounded-[8px] bg-bg-2 px-2.5 text-[12px] leading-8 text-text-3">Votre réponse…</div>
          </div>
        )}
      </div>
    </div>
  );
}
