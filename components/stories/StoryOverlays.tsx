"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import type { StoryPoll, StoryQuestion } from "@/lib/feed/types";
import { answerStoryQuestion, voteStoryPoll } from "@/app/(app)/story-actions";
import { pollPercentages } from "@/lib/stories/overlay";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

/** Style de placement d'une superposition à partir de sa position relative. */
export function overlayStyle(x: number, y: number, w?: number): React.CSSProperties {
  return { left: `${x * 100}%`, top: `${y * 100}%`, width: w ? `${w * 100}%` : undefined, transform: "translate(-50%, -50%)" };
}

/**
 * Sondage superposé : vote en un tap, puis répartition (barres) ; les votes
 * restent anonymes à l'écran, seul le service communication voit le détail.
 */
export function StoryPollOverlay({ poll, interactive = true, onVoted }: { poll: StoryPoll; interactive?: boolean; onVoted?: (p: StoryPoll) => void }) {
  const [state, setState] = useState(poll);
  const [pending, start] = useTransition();
  const toast = useToast();
  const voted = state.my_vote !== null && state.counts !== null;
  const pct = state.counts ? pollPercentages(state.counts) : null;
  const total = state.counts?.reduce((a, b) => a + b, 0) ?? 0;

  function vote(i: number) {
    if (!interactive || voted || pending) return;
    haptic();
    start(async () => {
      const r = await voteStoryPoll(state.id, i);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      const next = { ...state, my_vote: r.my_vote, counts: r.counts };
      setState(next);
      onVoted?.(next);
    });
  }

  return (
    <div
      className="pointer-events-auto absolute rounded-[16px] bg-white/95 p-3 text-text-1 shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
      style={overlayStyle(state.x, state.y, state.w)}
      role="group"
      aria-label={`Sondage : ${state.question}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-center text-[15px] font-semibold leading-[1.25] tracking-[-0.01em]">{state.question}</p>
      <div className="space-y-1.5">
        {state.options.map((opt, i) => {
          const mine = state.my_vote === i;
          return (
            <button
              key={i}
              type="button"
              disabled={!interactive || voted || pending}
              onClick={() => vote(i)}
              aria-pressed={mine}
              className={cn(
                "relative flex h-10 w-full items-center justify-between overflow-hidden rounded-[10px] bg-bg-2 px-3 text-left text-[14px] font-medium",
                !voted && interactive && "hover:bg-line active:scale-[0.99]",
                mine && "ring-1 ring-text-1",
              )}
            >
              {pct && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-navy-link/20 transition-[width] duration-500" style={{ width: `${pct[i]}%` }} />}
              <span className="relative truncate">{opt}</span>
              {pct && <span className="relative ml-2 shrink-0 tabular-nums text-[13px] text-text-2">{pct[i]} %</span>}
            </button>
          );
        })}
      </div>
      {voted && (
        <p className="mt-2 text-center text-[12px] text-text-3">
          {total} {total > 1 ? "votes" : "vote"}
        </p>
      )}
    </div>
  );
}

/** Question ouverte : réponse courte envoyée au service communication seulement. */
export function StoryQuestionOverlay({ question, interactive = true, onFocusChange }: { question: StoryQuestion; interactive?: boolean; onFocusChange?: (focused: boolean) => void }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  function submit() {
    const t = text.trim();
    if (!t || pending) return;
    haptic();
    start(async () => {
      const r = await answerStoryQuestion(question.id, t);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      setSent(true);
      setText("");
      onFocusChange?.(false);
    });
  }

  return (
    <div
      className="pointer-events-auto absolute w-[80%] rounded-[16px] bg-white/95 p-3 text-text-1 shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
      style={overlayStyle(question.x, question.y)}
      role="group"
      aria-label={`Question : ${question.prompt}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-center text-[15px] font-semibold leading-[1.25] tracking-[-0.01em]">{question.prompt}</p>
      {sent ? (
        <p role="status" className="text-center text-[13px] text-text-2">
          Réponse envoyée au service communication.
        </p>
      ) : (
        <form
          className="flex items-center gap-1 rounded-[10px] bg-bg-2 pl-3 pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
            disabled={!interactive}
            maxLength={200}
            placeholder="Votre réponse…"
            aria-label="Votre réponse"
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 bg-transparent text-[16px] text-text-1 outline-none placeholder:text-text-3"
          />
          <button type="submit" disabled={!interactive || pending || !text.trim()} aria-label="Envoyer" className="flex h-9 w-9 items-center justify-center rounded-full text-text-1 disabled:opacity-40">
            <Send size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </form>
      )}
      <p className="mt-1.5 text-center text-[11px] text-text-3">Visible du service communication seulement.</p>
    </div>
  );
}
