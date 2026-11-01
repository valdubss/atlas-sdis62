"use client";

import { useActionState, useState } from "react";
import { Check, ChevronRight, Eye, EyeOff } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CenterPicker } from "@/components/centre/CenterPicker";
import type { Directory } from "@/lib/centres/public";
import { APP_NAME, LIMITS } from "@/lib/config";
import { AGENT_STATUSES, AGENT_STATUS_LABELS, type AgentStatusValue } from "@/lib/auth/first-access-public";
import { cn } from "@/lib/cn";

const initial: OnboardingState = { status: "idle" };

/**
 * Accueil de la première connexion par matricule, sur un seul écran : identité et statut repris
 * de la liste des agents (le statut n'est demandé que s'il y manque), centre (le chef de centre
 * confirme l'appartenance), mot de passe. Un champ caché « username » permet au gestionnaire de
 * mots de passe du téléphone d'enregistrer le couple adresse + mot de passe. L'envoi mène
 * directement au fil.
 */
export function RegistryWelcome({
  firstName,
  lastName,
  matricule,
  status: knownStatus,
  accountEmail,
  centerId,
  directory,
  requireCenter,
}: {
  firstName: string;
  lastName: string;
  matricule: string | null;
  status: AgentStatusValue | null;
  accountEmail: string;
  centerId: string | null;
  directory: Directory;
  requireCenter: boolean;
}) {
  const [state, action, submitting] = useActionState(completeOnboarding, initial);
  const [status, setStatus] = useState<AgentStatusValue | "">(knownStatus ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [picker, setPicker] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<{ center_id: string | null; service_id: string | null; name: string } | null>(() => {
    const c = centerId ? directory.centers.find((x) => x.id === centerId) : null;
    return c ? { center_id: c.id, service_id: null, name: c.name } : null;
  });
  const fields = { ...(state.status === "error" ? state.fields ?? {} : {}), ...local };
  const clear = (key: string) => setLocal((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== key)));

  function check(e: React.FormEvent<HTMLFormElement>) {
    const errs: Record<string, string> = {};
    if (!status) errs.status = "Choisissez votre statut.";
    if (requireCenter && !choice) errs.center_id = "Choisissez votre centre ou votre service.";
    if (password.length < LIMITS.passwordMinLength) errs.password = `${LIMITS.passwordMinLength} caractères minimum.`;
    setLocal(errs);
    if (Object.keys(errs).length) e.preventDefault();
  }

  const name = `${firstName} ${lastName}`.trim();

  return (
    <div className="relative flex min-h-dvh flex-col justify-end bg-bg-0 sm:justify-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,rgba(200,16,46,0.18),transparent_70%)]" />

      <form action={action} onSubmit={check} className="relative mx-auto flex w-full max-w-[480px] flex-col sm:px-5" noValidate>
        <input type="hidden" name="registry_first" value="1" />
        <input type="hidden" name="need_password" value="1" />
        <input type="hidden" name="password_required" value="1" />
        <input type="hidden" name="first_name" value={firstName} />
        <input type="hidden" name="last_name" value={lastName} />
        <input type="hidden" name="personal_email" value="" />
        <input type="hidden" name="center_id" value={choice?.center_id ?? ""} />
        <input type="hidden" name="service_id" value={choice?.service_id ?? ""} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="confirm" value={password} />
        {/* Identifiant pour le gestionnaire de mots de passe (trousseau iCloud, Google) */}
        <input type="text" name="username" autoComplete="username" value={accountEmail} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />

        <section className="rounded-t-[26px] bg-bg-1 px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-6 ring-1 ring-glass-edge sm:rounded-[26px] sm:p-6" aria-label="Bienvenue">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-3">Bienvenue sur {APP_NAME}</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-text-1">{name ? `Bienvenue ${name}` : "Bienvenue"}</h1>
          <p className="mt-1.5 text-[15px] leading-[1.45] text-text-2">Votre matricule est reconnu. Choisissez votre centre et votre mot de passe, c&apos;est tout.</p>

          {(matricule || knownStatus) && (
            <dl className="mt-4 divide-y divide-line rounded-[12px] bg-bg-2 px-3.5 text-[15px]">
              {matricule && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-text-2">Matricule</dt>
                  <dd className="font-semibold tabular-nums text-text-1">{matricule}</dd>
                </div>
              )}
              {knownStatus && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-text-2">Statut</dt>
                  <dd className="font-semibold text-text-1">{AGENT_STATUS_LABELS[knownStatus]}</dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-5 space-y-5">
            {!knownStatus && (
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-text-2">Statut</p>
                <div role="radiogroup" aria-label="Statut" className="grid grid-cols-3 gap-2">
                  {AGENT_STATUSES.map((s) => {
                    const on = status === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`${s.label} — ${s.description}`}
                        onClick={() => {
                          setStatus(s.value);
                          clear("status");
                        }}
                        className={cn("pressable flex h-12 items-center justify-center gap-1.5 rounded-[12px] text-[16px] font-semibold ring-1 transition-colors", on ? "bg-text-1 text-bg-0 ring-text-1" : "bg-bg-2 text-text-1 ring-transparent")}
                      >
                        {s.label}
                        {on && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                {fields.status && <p className="text-[13px] text-red-text" role="alert">{fields.status}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-text-2">Centre ou service</p>
              <button
                type="button"
                onClick={() => {
                  setPicker(true);
                  clear("center_id");
                }}
                className={cn("pressable flex h-12 w-full items-center justify-between rounded-[12px] bg-bg-2 px-3.5 text-left text-[15px] ring-1", fields.center_id ? "ring-red" : "ring-transparent")}
              >
                <span className={choice ? "text-text-1" : "text-text-3"}>{choice?.name ?? "Choisir mon centre ou mon service…"}</span>
                <ChevronRight size={18} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
              </button>
              <p className={cn("text-[13px]", fields.center_id ? "text-red-text" : "text-text-3")} role={fields.center_id ? "alert" : undefined}>
                {fields.center_id ?? "Votre chef de centre confirme que vous en faites partie. En attendant, vous avez accès au fil."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="welcome-password" className="block text-[13px] font-medium text-text-2">Mot de passe</label>
              <div className="relative">
                <input
                  id="welcome-password"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={LIMITS.passwordMinLength}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clear("password");
                  }}
                  aria-invalid={fields.password ? true : undefined}
                  className={cn("block h-12 w-full rounded-[12px] bg-bg-2 pl-3.5 pr-12 text-[15px] text-text-1 outline-none ring-1 focus:ring-glass-edge", fields.password || fields.confirm ? "ring-red" : "ring-transparent")}
                />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-[10px] text-text-3 hover:text-text-1">
                  {show ? <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.75} aria-hidden="true" />}
                </button>
              </div>
              <p className={cn("text-[13px]", fields.password || fields.confirm ? "text-red-text" : "text-text-3")} role={fields.password ? "alert" : undefined}>
                {fields.password ?? fields.confirm ?? `${LIMITS.passwordMinLength} caractères minimum. Votre téléphone peut le retenir pour vous.`}
              </p>
            </div>
          </div>

          {state.status === "error" && !state.fields && (
            <p className="mt-4 text-[13px] text-red-text" role="alert">
              {state.message}
            </p>
          )}

          <Button type="submit" className="mt-6 w-full" loading={submitting}>
            Entrer dans {APP_NAME}
          </Button>
        </section>
      </form>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Choisir un centre ou un service" tall>
        <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          <CenterPicker
            directory={directory}
            mode="attach"
            currentCenterId={choice?.center_id ?? null}
            currentServiceId={choice?.service_id ?? null}
            onPick={(sel) => {
              setChoice(sel);
              setPicker(false);
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}
