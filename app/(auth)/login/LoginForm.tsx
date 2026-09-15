"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { sendMagicLink, signInWithPassword, startSso, type LoginState } from "./actions";
import type { AuthSettings } from "@/lib/auth/providers";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const initial: LoginState = { status: "idle" };
type Mode = "password" | "link";

const input = "h-11 w-full rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge";

/**
 * Connexion : SSO Microsoft en premier s'il est configuré, puis e-mail + mot de
 * passe, puis « première connexion ou mot de passe oublié » (lien e-mail).
 * Un seul bouton rouge : le SSO s'il existe, sinon le bouton du mode courant.
 */
export function LoginForm({ next, auth }: { next: string; domains?: string[]; auth: AuthSettings }) {
  const [mode, setMode] = useState<Mode>(auth.passwordEnabled ? "password" : "link");
  const [pwdState, pwdAction, pwdPending] = useActionState(signInWithPassword, initial);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, initial);
  const [ssoState, ssoAction, ssoPending] = useActionState(startSso, initial);
  const [showPassword, setShowPassword] = useState(false);

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

  const placeholder = "E-mail";
  const error = mode === "password" ? (pwdState.status === "error" ? pwdState.message : null) : linkState.status === "error" ? linkState.message : null;
  const secondaryVariant = auth.ssoEnabled ? "secondary" : "primary";

  return (
    <div className="space-y-4">
      <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">{auth.ssoForced ? "Connexion" : mode === "password" || auth.ssoEnabled ? "Connexion" : "Première connexion"}</p>

      {auth.ssoEnabled && (
        <form action={ssoAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <Button type="submit" className="w-full" loading={ssoPending}>
            Continuer avec Microsoft
          </Button>
          {ssoState.status === "error" && (
            <p className="text-[13px] text-red-text" role="alert">
              {ssoState.message}
            </p>
          )}
          {auth.ssoForced && <p className="text-[13px] text-text-3">Utilisez votre compte professionnel du SDIS 62.</p>}
        </form>
      )}

      {!auth.ssoForced && mode === "password" && auth.passwordEnabled && (
        <form action={pwdAction} className="space-y-3" noValidate>
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" autoComplete="username" inputMode="email" placeholder={placeholder} aria-label="Adresse e-mail" required className={input} />
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Mot de passe"
              aria-label="Mot de passe"
              required
              className={cn(input, "pr-12", error && "ring-red")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[8px] text-text-3 hover:text-text-1"
            >
              {showPassword ? <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.75} aria-hidden="true" />}
            </button>
          </div>
          {error && (
            <p className="text-[13px] text-red-text" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant={secondaryVariant} className="w-full" loading={pwdPending}>
            Se connecter
          </Button>
        </form>
      )}

      {!auth.ssoForced && mode === "link" && auth.magicLinkEnabled && (
        <form action={linkAction} className="space-y-3" noValidate>
          <input type="hidden" name="next" value={next && next !== "/" ? next : "/bienvenue?mdp=1"} />
          <p className="text-[15px] text-text-2">Saisissez votre adresse : vous recevrez un lien pour créer votre mot de passe.</p>
          <input name="email" type="email" autoComplete="email" inputMode="email" placeholder={placeholder} aria-label="Adresse e-mail" required className={cn(input, error && "ring-red")} />
          {error && (
            <p className="text-[13px] text-red-text" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant={secondaryVariant} className="w-full" loading={linkPending}>
            Recevoir mon lien
          </Button>
        </form>
      )}

      {!auth.ssoForced && auth.passwordEnabled && auth.magicLinkEnabled && (
        <button
          type="button"
          onClick={() => setMode((m) => (m === "password" ? "link" : "password"))}
          className="block w-full text-center text-[15px] font-medium text-text-2 hover:text-text-1"
        >
          {mode === "password" ? "Première connexion ou mot de passe oublié" : "J'ai déjà un mot de passe"}
        </button>
      )}
    </div>
  );
}
