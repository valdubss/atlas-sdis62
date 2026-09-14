"use client";

import { useActionState, useState } from "react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const initial: LoginState = { status: "idle" };
type Mode = "password" | "link";

const input = "h-11 w-full rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge";

/**
 * Connexion par e-mail et mot de passe (défaut). « Première connexion » ou
 * « mot de passe oublié » : l'agent saisit son adresse, reçoit un lien, puis
 * définit son mot de passe sur /bienvenue. Un seul bouton rouge.
 */
export function LoginForm({ next, domains }: { next: string; domains: string[] }) {
  const [mode, setMode] = useState<Mode>("password");
  const [pwdState, pwdAction, pwdPending] = useActionState(signInWithPassword, initial);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, initial);

  if (linkState.status === "sent") {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Lien envoyé</p>
        <p className="text-[15px] text-text-2">
          Ouvrez l&apos;e-mail reçu sur <span className="text-text-1">{linkState.email}</span> et touchez le lien : vous choisirez ensuite votre mot de passe. Le lien est valable une heure.
        </p>
        <p className="text-[13px] text-text-3">Rien reçu ? Vérifiez vos indésirables, puis réessayez dans quelques minutes.</p>
      </div>
    );
  }

  const placeholder = domains[0] ? `prenom.nom@${domains[0]}` : "Adresse e-mail";
  const error = mode === "password" ? (pwdState.status === "error" ? pwdState.message : null) : linkState.status === "error" ? linkState.message : null;

  return (
    <div className="space-y-4">
      <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">{mode === "password" ? "Connexion" : "Première connexion"}</p>

      {mode === "password" ? (
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
      ) : (
        <form action={linkAction} className="space-y-3" noValidate>
          {/* Après le lien, l'agent définit son mot de passe */}
          <input type="hidden" name="next" value="/bienvenue" />
          <p className="text-[15px] text-text-2">Saisissez votre adresse : vous recevrez un lien pour créer votre mot de passe.</p>
          <input name="email" type="email" autoComplete="email" inputMode="email" placeholder={placeholder} aria-label="Adresse e-mail" required className={cn(input, error && "ring-red")} />
          {error && (
            <p className="text-[13px] text-red-text" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={linkPending}>
            Recevoir mon lien
          </Button>
        </form>
      )}

      <button
        type="button"
        onClick={() => setMode((m) => (m === "password" ? "link" : "password"))}
        className="block w-full text-center text-[15px] font-medium text-text-2 hover:text-text-1"
      >
        {mode === "password" ? "Première connexion ou mot de passe oublié" : "J'ai déjà un mot de passe"}
      </button>
    </div>
  );
}
