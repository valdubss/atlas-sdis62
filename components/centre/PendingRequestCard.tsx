"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyRequest } from "@/app/(app)/centre/actions";
import type { PendingRequest } from "@/lib/membership/request";
import type { Directory } from "@/lib/centres/public";
import { CenterPicker } from "./CenterPicker";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateLong } from "@/lib/format";

/**
 * Onglet « Mon centre » pendant qu'une demande de rattachement attend sa
 * validation : état clair, retrait sur place, et sélecteur masqué tant que
 * l'agent ne demande pas à changer de choix.
 */
export function PendingRequestCard({ pending, directory }: { pending: PendingRequest; directory: Directory }) {
  const [changing, setChanging] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function cancel() {
    start(async () => {
      const r = await cancelMyRequest(pending.id);
      if (!r.ok) return toast(r.error);
      toast("Demande retirée");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Demande en attente</p>
        <p className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">{pending.center?.name ?? pending.service?.name}</p>
        <p className="mt-1 text-[13px] text-text-2">
          Votre chef de centre (ou le service communication) confirme votre arrivée. Vous serez prévenu de la réponse. Valable jusqu&apos;au {formatDateLong(pending.expires_at)}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="md" onClick={() => setChanging((v) => !v)}>
            {changing ? "Garder ce choix" : "Changer de choix"}
          </Button>
          <Button type="button" variant="secondary" size="md" loading={busy} onClick={cancel}>
            Retirer la demande
          </Button>
        </div>
      </section>
      {changing && (
        <>
          <p className="px-1 text-[13px] text-text-3">Choisir un autre centre remplace la demande en cours.</p>
          <CenterPicker directory={directory} mode="attach" currentCenterId={pending.center?.id ?? null} currentServiceId={pending.service?.id ?? null} />
        </>
      )}
    </div>
  );
}
