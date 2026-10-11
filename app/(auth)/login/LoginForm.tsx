"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { sendMagicLink, signInWithPassword, startSso, verifyEmailCode, type LoginState } from "./actions";
import type { AuthSettings } from "@/lib/auth/providers";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const initial: LoginState = { status: "idle" };
type Mode = "password" | "link";

const input = "h-11 w-full rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge";

/**
 * Connexion : SSO Microsoft en premier s'il est configuré, sinon e-mail
 * professionnel + mot de passe. Première connexion ou mot de passe oublié :
 * un e-mail d'ATLAS avec le lien (et un code à six chiffres) pour définir le
 * mot de passe.
 */
export function LoginForm({ next, auth, mailFromApp = true }: { next: string; domains?: string[]; auth: AuthSettings; /** E-mails envoyés par ATLAS (lien + code) ; sinon e-mail standard Supabase (lien seul) */ mailFromApp?: boolean }) {
  const [mode, setMode] = useState<Mode>(auth.passwordEnabled ? "password" : "link");
  const [pwdState, pwdAction, pwdPending] = useActionState(signInWithPassword, initial);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, initial);
  const [ssoState, ssoAction, ssoPending] = useActionState(startSso, initial);
  const [codeState, codeAction, codePending] = useActionState(verifyEmailCode, initial);
  const [showPassword, setShowPassword] = useState(false);

  const sent = linkState.status === "sent" ? linkState : codeState.status === "sent" ? codeState : null;
  if (sent) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="space-y-1">
          <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">E-mail envoyé</p>
          <p className="text-[15px] text-text-2">
            Sur <span className="text-text-1">{sent.email}</span> : touchez le lien pour définir votre mot de passe{mailFromApp ? ", ou saisissez ici le code à six chiffres qui figure dans l'e-mail" : ""}. Valable {mailFromApp ? "quinze minutes" : "une heure"}.
          </p>
        </div>
        {mailFromApp && (
        <form action={codeAction} className="space-y-3" noValidate>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={sent.next} />
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
            className={cn(input, "text-center text-[22px] tracking-[0.3em]", codeState.status === "error" && "ring-red")}
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
        )}
        <p className="text-[13px] text-text-3">{mailFromApp ? "Rien reçu ? Vérifiez vos indésirables. Le code et le lien arrivent dans le même e-mail ; si la messagerie du SDIS a déjà « ouvert » le lien, le code fonctionne quand même." : "Rien reçu ? Vérifiez vos indésirables. Ouvrez le lien depuis l'appareil où vous avez fait la demande."}</p>
      </div>
    );
  }

  const placeholder = "E-mail";
  const error = mode === "password" ? (pwdState.status === "error" ? pwdState.message : null) : linkState.status === "error" ? linkState.message : null;
  const secondaryVariant = auth.ssoEnabled ? "secondary" : "primary";

  return (
    <div className="space-y-4">
      <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Connexion</p>

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
          <input type="hidden" name="next" value={next && next !== "/" ? next : "/"} />
          <p className="text-[15px] text-text-2">Première connexion ou mot de passe oublié : saisissez votre adresse @sdis62.fr, vous recevez un e-mail avec un lien pour définir votre mot de passe.</p>
          <input name="email" type="email" autoComplete="email" inputMode="email" placeholder={placeholder} aria-label="Adresse e-mail" required className={cn(input, error && "ring-red")} />
          {error && (
            <p className="text-[13px] text-red-text" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant={secondaryVariant} className="w-full" loading={linkPending}>
            Recevoir le lien
          </Button>
        </form>
      )}

      {!auth.ssoForced && auth.passwordEnabled && auth.magicLinkEnabled && (
        <button
          type="button"
          onClick={() => setMode((m) => (m === "password" ? "link" : "password"))}
          className="block w-full text-center text-[15px] font-medium text-text-2 hover:text-text-1"
        >
          {mode === "password" ? "Première connexion ou mot de passe oublié ?" : "J'ai déjà un mot de passe"}
        </button>
      )}
    </div>
  );
}
