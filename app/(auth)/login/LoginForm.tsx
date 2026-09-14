"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Ecg } from "@/components/brand/Ecg";

const initial: LoginState = { status: "idle" };

export function LoginForm({ next, domains }: { next: string; domains: string[] }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <div className="space-y-4 text-center" role="status" aria-live="polite">
        <Ecg className="mx-auto h-8 w-40 text-red" animate />
        <h2 className="font-display text-2xl font-bold uppercase text-navy">
          Lien envoyé
        </h2>
        <p className="text-body">
          Ouvrez l&apos;e-mail reçu sur <strong>{state.email}</strong> et cliquez sur
          le lien pour vous connecter. Il est valable une heure.
        </p>
        <p className="text-sm text-muted">
          Rien reçu ? Vérifiez vos indésirables, puis réessayez dans quelques minutes.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field
        label="Adresse e-mail professionnelle"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={domains[0] ? `prenom.nom@${domains[0]}` : "prenom.nom@…"}
        required
        error={state.status === "error" ? state.message : undefined}
      />
      <Button type="submit" className="w-full" loading={pending}>
        Recevoir mon lien de connexion
      </Button>
      <p className="text-center text-xs text-muted">
        Pas de mot de passe : vous recevez un lien à usage unique par e-mail.
      </p>
    </form>
  );
}
