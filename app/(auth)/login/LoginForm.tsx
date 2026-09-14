"use client";

import { useActionState, useState } from "react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Ecg } from "@/components/brand/Ecg";
import { cn } from "@/lib/cn";

const initial: LoginState = { status: "idle" };
type Mode = "magic" | "password";

export function LoginForm({ next, domains }: { next: string; domains: string[] }) {
  const [mode, setMode] = useState<Mode>("magic");
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initial);
  const [pwdState, pwdAction, pwdPending] = useActionState(signInWithPassword, initial);

  if (magicState.status === "sent") {
    return (
      <div className="space-y-4 text-center" role="status" aria-live="polite">
        <Ecg className="mx-auto h-8 w-40 text-red" animate />
        <h2 className="font-display text-2xl font-bold uppercase text-navy">Lien envoyé</h2>
        <p className="text-body">
          Ouvrez l&apos;e-mail reçu sur <strong>{magicState.email}</strong> et cliquez sur le
          lien pour vous connecter. Il est valable une heure.
        </p>
        <p className="text-sm text-muted">
          Rien reçu ? Vérifiez vos indésirables, puis réessayez dans quelques minutes.
        </p>
      </div>
    );
  }

  const placeholder = domains[0] ? `prenom.nom@${domains[0]}` : "prenom.nom@…";

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Mode de connexion"
        className="grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-semibold"
      >
        {(
          [
            ["magic", "Lien par e-mail"],
            ["password", "Mot de passe"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "rounded-lg px-3 py-2 transition-colors",
              mode === id ? "bg-surface text-navy shadow-soft" : "text-muted hover:text-navy",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "magic" ? (
        <form action={magicAction} className="space-y-5" noValidate>
          <input type="hidden" name="next" value={next} />
          <Field
            label="Adresse e-mail professionnelle"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={placeholder}
            required
            error={magicState.status === "error" ? magicState.message : undefined}
          />
          <Button type="submit" className="w-full" loading={magicPending}>
            Recevoir mon lien de connexion
          </Button>
          <p className="text-center text-xs text-muted">
            Pas de mot de passe : vous recevez un lien à usage unique par e-mail.
          </p>
        </form>
      ) : (
        <form action={pwdAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <Field
            label="Adresse e-mail"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder={placeholder}
            required
          />
          <Field
            label="Mot de passe"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            error={pwdState.status === "error" ? pwdState.message : undefined}
          />
          <Button type="submit" className="w-full" loading={pwdPending}>
            Se connecter
          </Button>
          <p className="text-center text-xs text-muted">
            Le mot de passe se définit depuis votre page Profil après une première connexion
            par lien e-mail.
          </p>
        </form>
      )}
    </div>
  );
}
