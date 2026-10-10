"use client";

import { useActionState, useState } from "react";
import { decideByToken, type DecisionState } from "./actions";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

const initial: DecisionState = { status: "idle" };

export function DecisionForm({ token, initialDecision }: { token: string; initialDecision: "accepter" | "refuser" }) {
  const [decision, setDecision] = useState<"accepter" | "refuser">(initialDecision);
  const [state, action, pending] = useActionState(decideByToken, initial);

  if (state.status === "done") {
    return (
      <p role="status" className="mt-5 rounded-[12px] bg-bg-1 px-4 py-3 text-[15px] text-text-1">
        {state.accepted ? `${state.requesterName} fait maintenant partie de ${state.targetName}. Il en est informé.` : `Demande de ${state.requesterName} refusée. Il en est informé.`}
      </p>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decision" value={decision} />
      <div className="flex gap-2" role="radiogroup" aria-label="Décision">
        {(["accepter", "refuser"] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={decision === d} onClick={() => setDecision(d)} className={cn("h-10 flex-1 rounded-[10px] text-[15px] font-medium", decision === d ? (d === "accepter" ? "bg-red-fill text-white" : "bg-bg-2 text-text-1 ring-1 ring-glass-edge") : "bg-bg-1 text-text-2")}>
            {d === "accepter" ? "Accepter" : "Refuser"}
          </button>
        ))}
      </div>
      {decision === "refuser" && <TextareaField label="Motif (facultatif, transmis à l'agent)" name="note" rows={2} maxLength={400} />}
      {state.status === "error" && (
        <p role="alert" className="text-[13px] text-red-text">
          {state.message}
        </p>
      )}
      <Button type="submit" className="w-full" loading={pending}>
        {decision === "accepter" ? "Confirmer l'accueil dans le centre" : "Confirmer le refus"}
      </Button>
    </form>
  );
}
