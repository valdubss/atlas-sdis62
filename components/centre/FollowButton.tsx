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
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={following}
      onClick={() =>
        start(async () => {
          const next = !following;
          setFollowing(next);
          const r = await followCenter(centerId, next);
          if (!r.ok) {
            setFollowing(!next);
            toast(r.error);
            return;
          }
          toast(next ? "Centre suivi" : "Centre retiré de vos suivis");
          router.refresh();
        })
      }
      className={cn("pressable inline-flex h-11 items-center gap-2 rounded-[12px] px-4 text-[15px] font-semibold", following ? "bg-bg-2 text-text-1" : "bg-red-fill text-white")}
    >
      {following ? <BellOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <Bell size={18} strokeWidth={1.75} aria-hidden="true" />}
      {following ? "Suivi" : "Suivre ce centre"}
    </button>
  );
}
