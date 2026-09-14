"use client";

import { useActionState, useState } from "react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const initial: LoginState = { status: "idle" };
type Mode = "magic" | "password";

const input =
  "h-11 w-full rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge";

/** Formulaire de connexion : lien par e-mail (défaut) ou mot de passe. Un seul bouton rouge. */
export function LoginForm({ next, domains }: { next: string; domains: string[] }) {
  const [mode, setMode] = useState<Mode>("magic");
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initial);
  const [pwdState, pwdAction, pwdPending] = useActionState(signInWithPassword, initial);

  if (magicState.status === "sent") {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Lien envoyé</p>
        <p className="text-[15px] text-text-2">
          Ouvrez l&apos;e-mail reçu sur <span className="text-text-1">{magicState.email}</span> et touchez le lien. Il est valable une heure.
        </p>
        <p className="text-[13px] text-text-3">Rien reçu ? Vérifiez vos indésirables, puis réessayez dans quelques minutes.</p>
      </div>
    );
  }

  const placeholder = domains[0] ? `prenom.nom@${domains[0]}` : "Adresse e-mail";
  const error = mode === "magic" ? (magicState.status === "error" ? magicState.message : null) : pwdState.status === "error" ? pwdState.message : null;

  return (
    <div className="space-y-4">
      <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Connexion</p>

      {mode === "magic" ? (
        <form action={magicAction} className="space-y-3" noValidate>
          <input type="hidden" name="next" value={next} />
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={placeholder}
            aria-label="Adresse e-mail"
            required
            className={cn(input, error && "ring-red")}
          />
          {error && (
            <p className="text-[13px] text-red-text" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={magicPending}>
            Recevoir un lien de connexion
          </Button>
        </form>
      ) : (
        <form action={pwdAction} className="space-y-3" noValidate>
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" autoComplete="username" inputMode="email" placeholder={placeholder} aria-label="Adresse e-mail" required className={input} />
          <input name="password" type="password" autoComplete="current-password" placeholder="Mot de passe" aria-label="Mot de passe" required className={cn(input, error && "ring-red")} />
          {error && (
            <p className="text-[13px] text-red-text" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={pwdPending}>
            Se connecter
          </Button>
        </form>
      )}

      <button
        type="button"
        onClick={() => setMode((m) => (m === "magic" ? "password" : "magic"))}
        className="block w-full text-center text-[15px] font-medium text-text-2 hover:text-text-1"
      >
        {mode === "magic" ? "Utiliser un mot de passe" : "Recevoir un lien par e-mail"}
      </button>
    </div>
  );
}
