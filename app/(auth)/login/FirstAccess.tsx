"use client";

import { useActionState } from "react";
import { IdCard, MailCheck } from "lucide-react";
import { requestFirstAccessAction, verifyEmailCode, type FirstAccessState, type LoginState } from "./actions";
import { Sheet } from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const initial: FirstAccessState = { status: "idle" };
const codeInitial: LoginState = { status: "idle" };

/**
 * Première connexion par matricule : adresse SDIS, matricule, adresse personnelle, puis le code
 * à six chiffres reçu sur l'adresse personnelle. Le serveur vérifie le matricule dans le
 * référentiel avant tout envoi ; un matricule inconnu est refusé ici même.
 */
export function FirstAccess({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(requestFirstAccessAction, initial);
  const [codeState, codeAction, codePending] = useActionState(verifyEmailCode, codeInitial);
  const fields = state.status === "error" ? state.fields ?? {} : {};

  return (
    <Sheet open={open} onClose={onClose} title="Première connexion">
      <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        {state.status === "sent" ? (
          <div className="space-y-4" role="status" aria-live="polite">
            <div className="flex items-start gap-3">
              <MailCheck size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Code envoyé</p>
                <p className="text-[15px] text-text-2">
                  Regardez la boîte <span className="text-text-1">{state.email}</span> (et ses indésirables) : le code à six chiffres est dans l&apos;objet de l&apos;e-mail. Valable quinze minutes.
                </p>
              </div>
            </div>
            <form action={codeAction} className="space-y-3" noValidate>
              <input type="hidden" name="email" value={state.email} />
              <input type="hidden" name="next" value="/bienvenue?mdp=1" />
              <input
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="Code à 6 chiffres"
                aria-label="Code reçu par e-mail"
                autoFocus
                className={cn("h-12 w-full rounded-[12px] bg-bg-1 px-3.5 text-center text-[22px] tracking-[0.3em] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge", codeState.status === "error" && "ring-red")}
              />
              {codeState.status === "error" && (
                <p className="text-[13px] text-red-text" role="alert">
                  {codeState.message}
                </p>
              )}
              <Button type="submit" className="w-full" loading={codePending}>
                Valider le code
              </Button>
            </form>
            <p className="text-[13px] text-text-3">Rien reçu ? Fermez cette fenêtre et recommencez : un nouveau code remplace le précédent.</p>
          </div>
        ) : (
          <form action={action} className="space-y-4" noValidate>
            <div className="flex items-start gap-3">
              <IdCard size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-2" aria-hidden="true" />
              <p className="text-[15px] text-text-2">Votre matricule doit figurer dans la liste des agents du SDIS 62. Vous recevez un code sur votre adresse personnelle, puis vous choisissez votre centre et votre mot de passe.</p>
            </div>
            <Field label="Adresse e-mail SDIS" name="email" type="email" inputMode="email" autoComplete="username" placeholder="prenom.nom@sdis62.fr" required error={fields.email} />
            <Field label="Matricule" name="matricule" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" placeholder="Ex. 12345" required error={fields.matricule} />
            <Field label="Adresse e-mail personnelle" name="personalEmail" type="email" inputMode="email" autoComplete="email" placeholder="vous@exemple.fr" required error={fields.personalEmail} hint="C'est là que vous recevez votre code aujourd'hui, et vos demandes de mot de passe ensuite." />
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
