"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, IdCard } from "lucide-react";
import { requestFirstAccessAction, type FirstAccessState } from "./actions";
import { Sheet } from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { TEMP_PASSWORD_DAYS_PUBLIC } from "@/lib/auth/first-access-public";

const initial: FirstAccessState = { status: "idle" };

/**
 * Première connexion par matricule : feuille avec trois champs (adresse SDIS, matricule,
 * adresse personnelle). Le serveur vérifie le matricule dans le référentiel avant tout envoi ;
 * un matricule inconnu est refusé ici même. Succès : mot de passe temporaire parti sur
 * l'adresse personnelle, retour à l'écran de connexion avec l'identifiant prérempli.
 */
export function FirstAccess({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (identifier: string) => void }) {
  const [state, action, pending] = useActionState(requestFirstAccessAction, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};
  const lastEmail = useRef("");

  useEffect(() => {
    if (state.status === "sent") lastEmail.current = state.email;
  }, [state]);

  return (
    <Sheet open={open} onClose={onClose} title="Première connexion">
      <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        {state.status === "sent" ? (
          <div className="space-y-4" role="status" aria-live="polite">
            <div className="flex items-start gap-3 rounded-[16px] bg-bg-1 p-4">
              <CheckCircle2 size={24} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Mot de passe temporaire envoyé</p>
                <p className="text-[15px] text-text-2">
                  Regardez la boîte <span className="text-text-1">{state.personalEmail}</span> (et ses indésirables). Il est valable {TEMP_PASSWORD_DAYS_PUBLIC} jours.
                </p>
              </div>
            </div>
            <p className="text-[13px] text-text-3">Connectez-vous ensuite avec votre adresse SDIS ou votre matricule. À la première connexion, vous choisirez votre mot de passe personnel.</p>
            <Button type="button" className="w-full" onClick={() => onDone(state.email)}>
              J&apos;ai reçu mon mot de passe
            </Button>
          </div>
        ) : (
          <form action={action} className="space-y-4" noValidate>
            <div className="flex items-start gap-3">
              <IdCard size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-2" aria-hidden="true" />
              <p className="text-[15px] text-text-2">Votre matricule doit figurer dans la liste des agents du SDIS 62. Le mot de passe temporaire arrive sur votre adresse personnelle.</p>
            </div>
            <Field label="Adresse e-mail SDIS" name="email" type="email" inputMode="email" autoComplete="username" placeholder="prenom.nom@sdis62.fr" required error={fields.email} />
            <Field label="Matricule" name="matricule" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" placeholder="Ex. 12345" required error={fields.matricule} />
            <Field label="Adresse e-mail personnelle" name="personalEmail" type="email" inputMode="email" autoComplete="email" placeholder="vous@exemple.fr" required error={fields.personalEmail} hint="Elle ne sert qu'à recevoir votre mot de passe temporaire et à récupérer votre compte." />
            {state.status === "error" && !state.fields && (
              <p className="text-[13px] text-red-text" role="alert">
                {state.message}
              </p>
            )}
            <Button type="submit" className="w-full" loading={pending}>
              Continuer
            </Button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
