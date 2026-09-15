"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { attachTo } from "@/app/(app)/centre/actions";
import type { Directory } from "@/lib/centres/public";
import { CenterPicker } from "./CenterPicker";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";

export type ProfileHistoryEntry = { id: number; field: string; changed_at: string; old_label: string | null; new_label: string | null };

const FIELD_LABELS: Record<string, string> = { center_id: "Centre", service_id: "Service", role: "Rôle", is_active: "Compte" };

/**
 * Changement de centre en un écran : choix du nouveau centre ou service,
 * récapitulatif de ce qui change (onglet Mon centre, notifications « mon centre »,
 * canaux de centre pour les référents), confirmation, puis historique.
 */
export function ChangeCenterFlow({ home, directory, history, currentCenterId, currentServiceId }: { home: { name: string; href: string } | null; directory: Directory; history: ProfileHistoryEntry[]; currentCenterId: string | null; currentServiceId: string | null }) {
  const [picker, setPicker] = useState(false);
  const [choice, setChoice] = useState<{ center_id: string | null; service_id: string | null; name: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function confirm() {
    if (!choice) return;
    start(async () => {
      const r = await attachTo({ center_id: choice.center_id ?? "", service_id: choice.service_id ?? "" });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      toast(`Rattachement mis à jour : ${choice.name}`);
      setChoice(null);
      router.refresh();
    });
  }

  return (
    <>
      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Rattachement</h2>
        <div className="mt-2 flex items-center gap-3">
          <span className="min-w-0 flex-1">
            {home ? (
              <Link href={home.href} className="block truncate text-[15px] text-text-1">
                {home.name}
              </Link>
            ) : (
              <span className="block text-[15px] text-text-2">Non renseigné</span>
            )}
            <span className="block text-[13px] text-text-3">Votre centre ou service apparaît dans l&apos;onglet « Mon centre »</span>
          </span>
          <button type="button" onClick={() => setPicker(true)} className="pressable flex h-10 items-center gap-1 rounded-[10px] bg-bg-2 px-3 text-[13px] font-medium text-text-1">
            {home ? "Changer" : "Choisir"}
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {history.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Historique</h3>
            <ul className="mt-1.5 space-y-1 text-[13px] text-text-2">
              {history.map((h) => (
                <li key={h.id}>
                  {formatDateTime(h.changed_at)} · {FIELD_LABELS[h.field] ?? h.field} : {h.old_label ?? "—"} → {h.new_label ?? "—"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Choisir un centre ou un service" tall>
        <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          <CenterPicker
            directory={directory}
            mode="attach"
            currentCenterId={currentCenterId}
            currentServiceId={currentServiceId}
            onPick={(sel) => {
              setPicker(false);
              setChoice(sel);
            }}
          />
        </div>
      </Sheet>

      <Sheet open={choice !== null} onClose={() => setChoice(null)} title="Confirmer le changement">
        {choice && (
          <div className="space-y-4 px-5 pb-[calc(max(env(safe-area-inset-bottom),12px)+84px)]">
            <p className="text-[15px] text-text-1">
              Nouveau rattachement : <span className="font-semibold">{choice.name}</span>
              {home && <span className="text-text-3"> (au lieu de {home.name})</span>}
            </p>
            <ul className="space-y-1.5 text-[13px] text-text-2">
              <li>• L&apos;onglet « Mon centre » affiche cette page.</li>
              <li>• Les notifications « Nouveautés de mon centre » suivent ce centre.</li>
              <li>• Si vous êtes référent, vos canaux de messagerie de centre restent liés à vos désignations.</li>
              <li>• Le changement est daté dans votre historique et visible du service communication.</li>
            </ul>
            <div className="flex gap-3">
              <Button type="button" loading={pending} onClick={confirm}>
                Confirmer
              </Button>
              <Button type="button" variant="secondary" onClick={() => setChoice(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
