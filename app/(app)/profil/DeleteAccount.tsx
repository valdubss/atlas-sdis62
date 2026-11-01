"use client";

import { useActionState, useState } from "react";
import { ChevronRight, TriangleAlert, UserRoundX } from "lucide-react";
import { deleteOwnAccount, type DeleteAccountState } from "./actions";
import { Sheet } from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initial: DeleteAccountState = { status: "idle" };
export const DELETE_WORD = "SUPPRIMER";

/**
 * Profil → « Supprimer mon compte » : feuille qui dit ce qui disparaît et ce qui reste
 * (commentaires et messages anonymisés), confirmation par le mot SUPPRIMER, puis suppression
 * définitive côté serveur et retour à l'écran de connexion.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(deleteOwnAccount, initial);
  const ready = typed.trim().toUpperCase() === DELETE_WORD;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pressable flex h-12 w-full items-center justify-between px-5 text-[15px] text-red-text">
        <span className="flex items-center gap-3">
          <UserRoundX size={20} strokeWidth={1.75} aria-hidden="true" />
          Supprimer mon compte
        </span>
        <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Supprimer mon compte">
        <form action={action} className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]" noValidate>
          <div className="flex items-start gap-3 rounded-[14px] bg-red-soft px-4 py-3">
            <TriangleAlert size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-red-text" aria-hidden="true" />
            <p className="text-[15px] leading-[1.45] text-text-1">Cette action est définitive. Votre compte et vos données sont supprimés tout de suite, sans possibilité de retour.</p>
          </div>

          <div className="space-y-2 text-[15px] leading-[1.45] text-text-2">
            <p>
              <span className="font-medium text-text-1">Supprimé :</span> votre profil (nom, matricule, adresses e-mail, photo), votre centre, vos réglages, vos favoris, vos réactions, vos votes, vos notifications et les appareils enregistrés.
            </p>
            <p>
              <span className="font-medium text-text-1">Conservé sans votre nom :</span> vos commentaires et vos messages dans les fils de discussion, pour que les échanges restent lisibles par les autres agents.
            </p>
            <p>Vous pourrez créer un nouveau compte plus tard par « Première connexion ».</p>
          </div>

          <Field
            label={`Écrivez ${DELETE_WORD} pour confirmer`}
            name="delete_confirm"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            error={state.status === "error" ? state.message : undefined}
          />

          <div className="flex flex-col gap-2">
            <Button type="submit" variant="primary" className="w-full" disabled={!ready} loading={pending}>
              Supprimer définitivement
            </Button>
            <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
