"use client";

import { useEffect, useState, useTransition } from "react";
import { BicepsFlexed, Flame, Heart, Send, ThumbsUp, type LucideIcon } from "lucide-react";
import { replyToStory } from "@/app/(app)/story-reply-actions";
import { setStoryReaction } from "@/app/(app)/story-actions";
import { REACTIONS, type ReactionKind } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

const ICONS: Record<ReactionKind, LucideIcon> = { clap: ThumbsUp, fire: Flame, heart: Heart, muscle: BicepsFlexed };

/**
 * Pied du viewer : les quatre réactions du fil (une par personne, visibles du
 * service communication seulement) et message au service communication.
 * La story se met en pause pendant la saisie.
 */
export function StoryReplyBar({ storyId, mine, onFocusChange }: { storyId: string; mine: ReactionKind | null; onFocusChange: (focused: boolean) => void }) {
  const [text, setText] = useState("");
  const [current, setCurrent] = useState<ReactionKind | null>(mine);
  const [burst, setBurst] = useState<ReactionKind | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => setCurrent(mine), [storyId, mine]);

  function react(kind: ReactionKind) {
    haptic();
    const next = current === kind ? null : kind;
    setCurrent(next);
    if (next) {
      setBurst(next);
      setTimeout(() => setBurst(null), 700);
    }
    start(async () => {
      const r = await setStoryReaction(storyId, next);
      if (!r.ok) {
        setCurrent(current);
        toast(r.error);
      }
    });
  }

  function send(message: string) {
    haptic();
    start(async () => {
      const r = await replyToStory({ story_id: storyId, message });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      setText("");
      onFocusChange(false);
      toast("Envoyé au service communication");
    });
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-around" role="group" aria-label="Réactions">
        {REACTIONS.map((r) => {
          const Icon = ICONS[r.kind];
          const active = current === r.kind;
          return (
            <button
              key={r.kind}
              type="button"
              onClick={() => react(r.kind)}
              aria-pressed={active}
              aria-label={r.label}
              className={cn("pressable relative flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition-transform", active && "text-red", burst === r.kind && "scale-125")}
            >
              <Icon size={26} strokeWidth={1.75} fill={active ? "currentColor" : "none"} aria-hidden="true" className="[filter:drop-shadow(0_1px_6px_rgba(0,0,0,0.6))]" />
            </button>
          );
        })}
      </div>
      <form
        className="flex items-center gap-2 rounded-full bg-black/45 py-1 pl-4 pr-1 ring-1 ring-white/20 backdrop-blur-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          maxLength={500}
          placeholder="Répondre au service communication…"
          aria-label="Votre réponse"
          enterKeyHint="send"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/60"
        />
        <button type="submit" disabled={pending || !text.trim()} aria-label="Envoyer" className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40">
          <Send size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
