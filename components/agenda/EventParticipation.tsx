"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Users } from "lucide-react";
import { fetchParticipants, setParticipation, type Participant } from "@/app/(app)/agenda/actions";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * « Je participe » sur un événement : bascule immédiate, compteur, et pour le service
 * communication ou le chef de centre, la liste nominative (chargée à l'ouverture).
 */
export function EventParticipation({ eventId, initialCount, initialMine, canSeeNames }: { eventId: string; initialCount: number; initialMine: boolean; canSeeNames: boolean }) {
  const [mine, setMine] = useState(initialMine);
  const [count, setCount] = useState(initialCount);
  const [names, setNames] = useState<Participant[] | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!canSeeNames) return;
    fetchParticipants(eventId).then(setNames);
  }, [eventId, canSeeNames, count]);

  function toggle() {
    const next = !mine;
    haptic();
    setMine(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    start(async () => {
      const r = await setParticipation(eventId, next);
      if (!r.ok) {
        setMine(!next);
        setCount((c) => Math.max(0, c + (next ? -1 : 1)));
        toast(r.error);
        return;
      }
      setCount(r.count);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={mine}
          aria-busy={pending}
          className={cn("pressable inline-flex h-11 items-center gap-2 rounded-[12px] px-4 text-[15px] font-semibold transition-colors", mine ? "bg-bg-2 text-text-1" : "bg-red-fill text-white")}
        >
          {mine ? <Check size={18} strokeWidth={2} aria-hidden="true" /> : <Users size={18} strokeWidth={1.75} aria-hidden="true" />}
          {mine ? "Je participe" : "Participer"}
        </button>
        <span className="text-[15px] text-text-2" aria-live="polite">
          {count === 0 ? "Aucun participant pour l'instant" : count === 1 ? (mine ? "Vous seul pour l'instant" : "1 participant") : `${count} participants`}
        </span>
      </div>
      {canSeeNames && names && names.length > 0 && (
        <div className="rounded-[12px] bg-bg-1 px-4 py-3">
          <p className="mb-1.5 text-[13px] font-semibold text-text-2">Participants</p>
          <ul className="space-y-1 text-[15px] text-text-1">
            {names.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate">{p.name ?? "Agent"}</span>
                {p.center && <span className="shrink-0 text-[13px] text-text-3">{p.center}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
