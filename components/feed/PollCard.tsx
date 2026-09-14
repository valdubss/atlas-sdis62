"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { Poll } from "@/lib/feed/types";
import { votePoll } from "@/app/(app)/feed-actions";
import { haptic } from "@/lib/motion";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/**
 * Sondage à choix unique. Avant le vote : options en boutons. Après le vote ou
 * à la clôture : barres de résultats en --text-1 sur --bg-2, choix de l'agent en
 * --red-text (le seul rouge de la carte).
 */
export function PollCard({ postId, poll: initial, preview = false }: { postId: string; poll: Poll; preview?: boolean }) {
  const [poll, setPoll] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();

  const closed = poll.closes_at ? new Date(poll.closes_at).getTime() <= Date.now() : false;
  const voted = poll.my_option_id !== null;
  const showResults = voted || closed;
  const total = poll.total_votes;

  function vote(optionId: string) {
    if (preview || voted || closed || pending) return;
    haptic();
    start(async () => {
      const res = await votePoll(postId, optionId);
      if (res.ok) setPoll(res.poll);
      else toast(res.error);
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {poll.options.map((o) => {
        const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
        const mine = poll.my_option_id === o.id;
        return showResults ? (
          <div key={o.id} className="relative h-11 overflow-hidden rounded-[10px] bg-bg-2" aria-label={`${o.label} : ${pct} %`}>
            <span className="absolute inset-y-0 left-0 bg-text-1/10 transition-[width] duration-300" style={{ width: `${pct}%` }} aria-hidden="true" />
            <span className="relative flex h-full items-center justify-between px-3.5 text-[15px]">
              <span className={cn("flex items-center gap-2", mine ? "font-medium text-red-text" : "text-text-1")}>
                {mine && <Check size={16} strokeWidth={2} aria-hidden="true" />}
                {o.label}
              </span>
              <span className={cn("tabular-nums", mine ? "text-red-text" : "text-text-2")}>{pct} %</span>
            </span>
          </div>
        ) : (
          <button
            key={o.id}
            type="button"
            disabled={pending || preview}
            onClick={() => vote(o.id)}
            className="flex h-11 w-full items-center rounded-[10px] bg-bg-2 px-3.5 text-left text-[15px] text-text-1 ring-1 ring-transparent hover:ring-glass-edge disabled:opacity-60"
          >
            {o.label}
          </button>
        );
      })}
      <p className="text-[13px] text-text-3">
        {total} {total > 1 ? "votes" : "vote"}
        {closed ? ", sondage clos" : poll.closes_at ? `, jusqu'au ${formatDateTime(poll.closes_at)}` : ""}
        {!showResults && !closed && ", résultats visibles après votre vote"}
      </p>
    </div>
  );
}
