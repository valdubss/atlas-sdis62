"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { sendMagicLink, signInWithPassword, startSso, verifyEmailCode, type LoginState } from "./actions";
import { FirstAccess } from "./FirstAccess";
import type { AuthSettings } from "@/lib/auth/providers";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";

const initial: LoginState = { status: "idle" };
type Mode = "password" | "link";

const input = "h-11 w-full rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge";

/**
 * Connexion : SSO Microsoft en premier s'il est configuré, sinon identifiant + mot de passe.
 *
 * Deux modes de première connexion (réglage administrateur) :
 *  - « link » : e-mail professionnel, lien (et code) reçu pour définir le mot de passe ;
 *  - « registry » : adresse SDIS + matricule + adresse personnelle vérifiés dans le référentiel,
 *    code reçu sur l'adresse personnelle, mot de passe choisi à l'accueil ;
 *    connexion ensuite par e-mail (personnelle ou SDIS) ou matricule.
 *    « Mot de passe oublié » : e-mail ou matricule → code sur l'adresse personnelle.
 */
export function LoginForm({ next, auth, mailFromApp = true }: { next: string; domains?: string[]; auth: AuthSettings; /** E-mails envoyés par ATLAS (lien + code) ; sinon e-mail standard Supabase (lien seul) */ mailFromApp?: boolean }) {
  const registry = auth.firstAccess === "registry";
  const [mode, setMode] = useState<Mode>(auth.passwordEnabled ? "password" : "link");
  const [pwdState, pwdAction, pwdPending] = useActionState(signInWithPassword, initial);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, initial);
  const [ssoState, ssoAction, ssoPending] = useActionState(startSso, initial);
  const [codeState, codeAction, codePending] = useActionState(verifyEmailCode, initial);
  const [showPassword, setShowPassword] = useState(false);
  const [firstAccessOpen, setFirstAccessOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const sent = linkState.status === "sent" ? linkState : codeState.status === "sent" ? codeState : null;
  const sentPanel = sent && (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="space-y-1">
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">E-mail envoyé</p>
        <p className="text-[15px] text-text-2">
          Sur <span className="text-text-1">{sent.display ?? sent.email}</span> : touchez le lien pour définir votre mot de passe{mailFromApp ? ", ou saisissez ici le code reçu (il est aussi dans l'objet de l'e-mail)" : ""}. Valable {mailFromApp ? "quinze minutes" : "une heure"}.
        </p>
      </div>
      {mailFromApp && (
        <form action={codeAction} className="space-y-3" noValidate>
          {sent.identifier ? <input type="hidden" name="identifier" value={sent.identifier} /> : <input type="hidden" name="email" value={sent.email} />}
          <input type="hidden" name="next" value={sent.next} />
          <input
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="Code reçu"
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

  // Mode « link » : l'écran entier devient le panneau « e-mail envoyé »
  if (sentPanel && !registry) return sentPanel;

  const placeholder = registry ? "E-mail ou matricule" : "E-mail";
  const linkError = linkState.status === "error" ? linkState.message : null;
  const error = mode === "password" ? (pwdState.status === "error" ? pwdState.message : null) : linkError;
  const secondaryVariant = auth.ssoEnabled ? "secondary" : "primary";

  const linkForm = (
    <form action={linkAction} className="space-y-3" noValidate>
      <input type="hidden" name="next" value={next && next !== "/" ? next : "/"} />
      <p className="text-[15px] text-text-2">{registry ? "Saisissez votre e-mail ou votre matricule : vous recevez un code sur votre adresse personnelle pour choisir un nouveau mot de passe." : "Première connexion ou mot de passe oublié : saisissez votre adresse @sdis62.fr, vous recevez un e-mail avec un lien pour définir votre mot de passe."}</p>
      {registry ? (
        <input name="identifier" type="text" autoComplete="username" autoCapitalize="none" inputMode="email" placeholder="E-mail ou matricule" aria-label="E-mail ou matricule" required className={cn(input, linkError && "ring-red")} />
      ) : (
        <input name="email" type="email" autoComplete="email" inputMode="email" placeholder="E-mail" aria-label="Adresse e-mail" required className={cn(input, linkError && "ring-red")} />
      )}
      {linkError && (
        <p className="text-[13px] text-red-text" role="alert">
          {linkError}
        </p>
      )}
      <Button type="submit" variant={registry ? "primary" : secondaryVariant} className="w-full" loading={linkPending}>
        {registry ? "Recevoir le code" : "Recevoir le lien"}
      </Button>
    </form>
  );

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
          {registry ? (
            <input name="identifier" type="text" autoComplete="username" autoCapitalize="none" inputMode="email" placeholder={placeholder} aria-label="Adresse e-mail ou matricule" required className={input} />
          ) : (
            <input name="email" type="email" autoComplete="username" inputMode="email" placeholder={placeholder} aria-label="Adresse e-mail" required className={input} />
          )}
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

      {!auth.ssoForced && !registry && mode === "link" && auth.magicLinkEnabled && linkForm}

      {!auth.ssoForced && !registry && auth.passwordEnabled && auth.magicLinkEnabled && (
        <button
          type="button"
          onClick={() => setMode((m) => (m === "password" ? "link" : "password"))}
          className="block w-full text-center text-[15px] font-medium text-text-2 hover:text-text-1"
        >
          {mode === "password" ? "Première connexion ou mot de passe oublié ?" : "J'ai déjà un mot de passe"}
        </button>
      )}

      {!auth.ssoForced && registry && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={() => setFirstAccessOpen(true)} className="text-[15px] font-semibold text-text-1 hover:opacity-80">
            Première connexion
          </button>
          <button type="button" onClick={() => setForgotOpen(true)} className="text-[15px] font-medium text-text-2 hover:text-text-1">
            Mot de passe oublié ?
          </button>
        </div>
      )}

      {registry && (
        <>
          <FirstAccess open={firstAccessOpen} onClose={() => setFirstAccessOpen(false)} />
          <Sheet open={forgotOpen} onClose={() => setForgotOpen(false)} title="Mot de passe oublié">
            <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
              {sentPanel ?? linkForm}
              {!sentPanel && <p className="text-[13px] text-text-3">Plus accès à votre adresse personnelle ? Adressez-vous au service communication.</p>}
            </div>
          </Sheet>
        </>
      )}
    </div>
  );
}
