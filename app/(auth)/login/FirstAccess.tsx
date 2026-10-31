"use client";

import { useActionState } from "react";
import { IdCard } from "lucide-react";
import { requestFirstAccessAction, type FirstAccessState } from "./actions";
import { Sheet } from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initial: FirstAccessState = { status: "idle" };

/**
 * Première connexion par matricule : feuille avec trois champs (matricule, nom, prénom).
 * Le serveur vérifie le matricule et le nom dans le référentiel ; un matricule inconnu est
 * refusé ici même. Succès : session ouverte, l'accueil s'affiche (statut, centre, mot de passe).
 */
export function FirstAccess({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(requestFirstAccessAction, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};

  return (
    <Sheet open={open} onClose={onClose} title="Première connexion">
      <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <form action={action} className="space-y-4" noValidate>
          <div className="flex items-start gap-3">
            <IdCard size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-2" aria-hidden="true" />
            <p className="text-[15px] text-text-2">Votre matricule doit figurer dans la liste des agents du SDIS 62. Vous choisirez ensuite votre centre, que votre chef de centre confirmera, et votre mot de passe.</p>
          </div>
          <Field label="Matricule" name="matricule" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" placeholder="Ex. 12345" required error={fields.matricule} autoFocus />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom" name="lastName" type="text" autoComplete="family-name" required error={fields.lastName} />
            <Field label="Prénom" name="firstName" type="text" autoComplete="given-name" required error={fields.firstName} />
          </div>
          {state.status === "error" && !state.fields && (
            <p className="text-[13px] text-red-text" role="alert">
              {state.message}
            </p>
          )}
          <Button type="submit" className="w-full" loading={pending}>
            Continuer
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
