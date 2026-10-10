"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideRequest } from "@/app/(app)/centre/actions";
import type { CenterRequest } from "@/lib/membership/request";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateLong } from "@/lib/format";

/**
 * Demandes de rattachement en attente, vues par le chef de centre, le
 * responsable com ou le service communication : accepter ou refuser (avec motif).
 */
export function MembershipRequests({ requests, title = "Demandes de rattachement", targetName }: { requests: (CenterRequest & { target?: string | null })[]; title?: string; targetName?: string }) {
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const router = useRouter();
  const toast = useToast();

  if (requests.length === 0) return null;

  function decide(id: string, accept: boolean, name: string) {
    start(async () => {
      const r = await decideRequest(id, accept, accept ? "" : note);
      if (!r.ok) return toast(r.error);
      toast(accept ? `${name} rejoint ${targetName ?? "le centre"}` : `Demande de ${name} refusée`);
      setDeclining(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <section id="demandes" className="space-y-3 rounded-[16px] bg-bg-1 px-5 py-4">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          {title} <span className="text-text-3">· {requests.length}</span>
        </h2>
        <p className="text-[13px] text-text-3">Un agent accepté voit la page du centre et ses événements. Sans réponse en sept jours, la demande expire.</p>
      </div>
      <ul className="space-y-3">
        {requests.map((r) => {
          const p = r.profile;
          const name = p ? `${p.first_name} ${p.last_name}`.trim() || "Agent" : "Agent";
          return (
            <li key={r.id} className="space-y-2 rounded-[12px] bg-bg-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={name} avatarKey={p?.avatar_key ?? null} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-text-1">{name}</span>
                  <span className="block truncate text-[13px] text-text-3">
                    {p?.job_title ? `${p.job_title} · ` : ""}
                    {r.target ? `${r.target} · ` : ""}demande du {formatDateLong(r.requested_at)}
                  </span>
                </span>
              </div>
              {declining === r.id ? (
                <div className="space-y-2">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={2} placeholder="Motif (facultatif, transmis à l'agent)" aria-label="Motif du refus" className="block w-full rounded-[10px] bg-bg-1 px-3 py-2 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge" />
                  <div className="flex gap-2">
                    <Button type="button" variant="danger" size="md" loading={pending} onClick={() => decide(r.id, false, name)}>
                      Confirmer le refus
                    </Button>
                    <Button type="button" variant="secondary" size="md" onClick={() => setDeclining(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" size="md" loading={pending} onClick={() => decide(r.id, true, name)}>
                    Accepter
                  </Button>
                  <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => setDeclining(r.id)}>
                    Refuser
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
