"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { followCenter } from "@/app/(app)/centre/actions";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/** Suivre un autre centre (3 au plus) : ses actus n'apparaissent que sur sa page, jamais dans le fil. */
export function FollowButton({ centerId, following: initial }: { centerId: string; following: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  // Réponse immédiate : l'état bascule au toucher, le serveur confirme en arrière-plan
  // (les onglets de la page « Mon centre » se mettent à jour par rafraîchissement silencieux)
  const toggle = () => {
    const next = !following;
    setFollowing(next);
    start(async () => {
      const r = await followCenter(centerId, next);
      if (!r.ok) {
        setFollowing(!next);
        toast(r.error);
        return;
      }
      router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] text-text-3" aria-live="polite">
        {following ? "Vous suivez ce centre." : "Suivez ce centre pour le retrouver dans vos onglets."}
      </p>
      <button
        type="button"
        aria-pressed={following}
        aria-busy={pending}
        onClick={toggle}
        className={cn("pressable inline-flex h-11 items-center gap-2 rounded-[12px] px-4 text-[15px] font-semibold transition-colors", following ? "bg-bg-2 text-text-1" : "bg-red-fill text-white")}
      >
        {following ? <BellOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <Bell size={18} strokeWidth={1.75} aria-hidden="true" />}
        {following ? "Suivi" : "Suivre ce centre"}
      </button>
    </div>
  );
}
