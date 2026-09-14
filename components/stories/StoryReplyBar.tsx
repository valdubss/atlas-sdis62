"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { replyToStory } from "@/app/(app)/story-reply-actions";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

const QUICK = ["🔥", "❤️", "👏", "💪", "😂", "😮"];

/**
 * Pied du viewer : réactions rapides et message au service communication.
 * La story se met en pause pendant la saisie.
 */
export function StoryReplyBar({ storyId, onFocusChange }: { storyId: string; onFocusChange: (focused: boolean) => void }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  function send(payload: { emoji?: string; message?: string }) {
    haptic();
    start(async () => {
      const r = await replyToStory({ story_id: storyId, ...payload });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      setSent(payload.emoji ?? "✓");
      setText("");
      onFocusChange(false);
      setTimeout(() => setSent(null), 1200);
      toast("Envoyé au service communication");
    });
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-1">
        {QUICK.map((e) => (
          <button
            key={e}
            type="button"
            disabled={pending}
            onClick={() => send({ emoji: e })}
            aria-label={`Réagir ${e}`}
            className={cn("pressable flex h-11 w-11 items-center justify-center rounded-full text-[24px] leading-none", sent === e && "scale-125")}
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2 rounded-full bg-black/45 py-1 pl-4 pr-1 ring-1 ring-white/20 backdrop-blur-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send({ message: text.trim() });
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
