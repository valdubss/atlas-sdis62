"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, Check, ChevronLeft, ChevronRight, KeyRound, MapPin, Shield, UserRound } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { CenterPicker } from "@/components/centre/CenterPicker";
import type { Directory } from "@/lib/centres/public";
import { LIMITS } from "@/lib/config";
import { SPRING } from "@/lib/motion";
import { pushSupported, subscribeBrowser } from "@/lib/push/client";
import { savePushSubscription } from "@/app/(app)/profil/notifications-actions";
import { AGENT_STATUSES, type AgentStatusValue } from "@/lib/auth/first-access-public";
import { cn } from "@/lib/cn";

type StepKey = "identite" | "statut" | "centre" | "motdepasse" | "notifications";
const STEP_META: Record<StepKey, { icon: typeof UserRound; title: string; text: string }> = {
  identite: { icon: UserRound, title: "Faisons connaissance", text: "Votre prénom et votre nom apparaissent dans vos commentaires. Ils restent internes au SDIS." },
  statut: { icon: Shield, title: "Votre statut", text: "Il sert au service communication pour adresser les bonnes informations aux bonnes personnes." },
  centre: { icon: MapPin, title: "Votre centre", text: "Choisissez votre centre d'incendie et de secours ou votre service. Votre chef de centre confirme que vous en faites bien partie." },
  motdepasse: { icon: KeyRound, title: "Votre mot de passe", text: `${LIMITS.passwordMinLength} caractères minimum. Il vous servira à chaque connexion, avec votre e-mail ou votre matricule.` },
  notifications: { icon: Bell, title: "Restez informé", text: "Soyez prévenu des publications et des annonces importantes. Vous choisissez ce que vous recevez, et vous pouvez changer d'avis à tout moment." },
};

const initial: OnboardingState = { status: "idle" };

/**
 * Accueil de première connexion : fenêtre centrée façon « pop-up », une étape à la fois
 * (identité, statut, centre, mot de passe, notifications), progression en points, retour
 * possible. Un seul envoi à la fin ; une erreur serveur renvoie à l'étape du champ concerné.
 */
export function Onboarding({ firstName, lastName, matricule, status: initialStatus, centerId, directory, needPassword, startAtForm = false, presetRole = null, passwordRequired = false, requireCenter = false, registryFirst = false, personalEmail = null }: { firstName: string; lastName: string; matricule?: string | null; status?: AgentStatusValue | null; centerId: string | null; directory: Directory; needPassword: boolean; startAtForm?: boolean; /** Chef de centre ou responsable com déjà rattaché d'office */ presetRole?: string | null; /** Mot de passe exigé (première connexion, lien « mot de passe oublié ») */ passwordRequired?: boolean; /** Centre ou service obligatoire (première connexion par matricule : le chef de centre valide l'appartenance) */ requireCenter?: boolean; /** Première connexion par matricule : identité reprise de la liste, pas d'étape notifications, retour à l'écran de connexion */ registryFirst?: boolean; personalEmail?: string | null }) {
  const steps: StepKey[] = ["identite", ...(startAtForm && initialStatus ? [] : (["statut"] as StepKey[])), "centre", ...(needPassword ? (["motdepasse"] as StepKey[]) : []), ...(startAtForm || registryFirst ? [] : (["notifications"] as StepKey[]))];
  // Identité connue par la liste des agents : l'étape se résume à un mot de bienvenue
  const welcome = registryFirst && Boolean(firstName && lastName);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [personal, setPersonal] = useState("");
  const [status, setStatus] = useState<AgentStatusValue | "">(initialStatus ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [choice, setChoice] = useState<{ center_id: string | null; service_id: string | null; name: string } | null>(() => {
    const c = centerId ? directory.centers.find((x) => x.id === centerId) : null;
    return c ? { center_id: c.id, service_id: null, name: c.name } : null;
  });
  const [pushDone, setPushDone] = useState<null | "on" | "skip">(null);
  const [pending, start] = useTransition();
  const [state, action, submitting] = useActionState(completeOnboarding, initial);
  const serverFields = state.status === "error" ? state.fields ?? {} : {};
  const reduced = useReducedMotion();
  const step = steps[index];
  const lastIndex = steps.length - 1;

  // Erreur serveur sur un champ : retour à l'étape concernée (état dérivé pendant le rendu,
  // pas d'effet : https://react.dev/learn/you-might-not-need-an-effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "error" && state.fields) {
      const key = Object.keys(state.fields)[0];
      const target: StepKey | undefined = key === "first_name" || key === "last_name" || key === "personal_email" ? "identite" : key === "status" ? "statut" : key === "center_id" ? "centre" : key === "password" || key === "confirm" ? "motdepasse" : undefined;
      const i = target ? steps.indexOf(target) : -1;
      if (i >= 0) {
        setDirection(-1);
        setIndex(i);
      }
    }
  }

  function validate(s: StepKey): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === "identite") {
      if (!first.trim()) e.first_name = "Champ obligatoire.";
      if (!last.trim()) e.last_name = "Champ obligatoire.";
    }
    if (s === "statut" && !status) e.status = "Choisissez votre statut.";
    if (s === "centre" && requireCenter && !choice) e.center_id = "Choisissez votre centre ou votre service.";
    if (s === "motdepasse" && (passwordRequired || password || confirm)) {
      if (password.length < LIMITS.passwordMinLength) e.password = `${LIMITS.passwordMinLength} caractères minimum.`;
      if (password !== confirm) e.confirm = "Les deux mots de passe ne correspondent pas.";
    }
    return e;
  }

  function next() {
    const e = validate(step);
    setLocal(e);
    if (Object.keys(e).length) return;
    setDirection(1);
    setIndex((i) => Math.min(lastIndex, i + 1));
  }
  function back() {
    setLocal({});
    setDirection(-1);
    setIndex((i) => Math.max(0, i - 1));
  }

  function enablePush() {
    start(async () => {
      try {
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!key || !pushSupported()) throw new Error();
        const sub = await subscribeBrowser(key);
        await savePushSubscription(sub, navigator.userAgent);
        setPushDone("on");
      } catch {
        setPushDone("skip");
      }
    });
  }

  const fields = { ...serverFields, ...local };
  const Icon = STEP_META[step].icon;

  return (
    <div className="relative flex min-h-dvh flex-col justify-end bg-bg-0 sm:justify-center">
      {/* Fond : halo discret derrière la fenêtre */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,rgba(200,16,46,0.18),transparent_70%)]" />

      <form action={action} className="relative mx-auto flex w-full max-w-[480px] flex-col sm:px-5" noValidate>
        {/* Valeurs envoyées en une fois à la fin */}
        <input type="hidden" name="need_password" value={needPassword ? "1" : "0"} />
        <input type="hidden" name="password_required" value={passwordRequired ? "1" : "0"} />
        {registryFirst && <input type="hidden" name="registry_first" value="1" />}
        <input type="hidden" name="center_id" value={choice?.center_id ?? ""} />
        <input type="hidden" name="service_id" value={choice?.service_id ?? ""} />
        {(step !== "identite" || welcome) && (
          <>
            <input type="hidden" name="first_name" value={first} />
            <input type="hidden" name="last_name" value={last} />
            <input type="hidden" name="personal_email" value={personal} />
          </>
        )}
        {step !== "statut" && <input type="hidden" name="status" value={status} />}
        {step !== "motdepasse" && needPassword && (
          <>
            <input type="hidden" name="password" value={password} />
            <input type="hidden" name="confirm" value={confirm} />
          </>
        )}

        <section className="rounded-t-[26px] bg-bg-1 px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 ring-1 ring-glass-edge sm:rounded-[26px] sm:p-6" aria-label="Bienvenue">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-3">Bienvenue sur MySDIS</p>
            <ol className="flex items-center gap-1.5" aria-label={`Étape ${index + 1} sur ${steps.length}`}>
              {steps.map((s, i) => (
                <li key={s} aria-current={i === index ? "step" : undefined} className={cn("h-1.5 rounded-full transition-all duration-300", i === index ? "w-5 bg-text-1" : i < index ? "w-1.5 bg-text-2" : "w-1.5 bg-line-strong")} />
              ))}
            </ol>
          </div>

          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={reduced ? false : { opacity: 0, x: 28 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: -28 * direction, transition: { duration: 0.14 } }}
              transition={SPRING}
              className="mt-5"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-bg-2 text-text-1">
                <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] leading-[1.15] text-text-1">{step === "identite" && welcome ? `Bienvenue ${firstName} ${lastName}` : step === "identite" && firstName ? `Bonjour ${firstName}` : STEP_META[step].title}</h1>
              <p className="mt-1.5 text-[15px] leading-[1.45] text-text-2">{step === "identite" && welcome ? "Votre matricule est reconnu. Encore trois étapes : votre statut, votre centre et votre mot de passe." : STEP_META[step].text}</p>

              <div className="mt-5 space-y-4">
                {step === "identite" && welcome && (
                  <dl className="divide-y divide-line rounded-[12px] bg-bg-2 px-3.5 text-[15px]">
                    {[
                      ["Matricule", matricule],
                      ["Adresse personnelle", personalEmail],
                    ]
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-3 py-2.5">
                          <dt className="text-text-2">{k}</dt>
                          <dd className="truncate font-semibold tabular-nums text-text-1">{v}</dd>
                        </div>
                      ))}
                  </dl>
                )}
                {step === "identite" && !welcome && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Prénom" name="first_name" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" required error={fields.first_name} autoFocus={!startAtForm} />
                      <Field label="Nom" name="last_name" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" required error={fields.last_name} />
                    </div>
                    {matricule && (
                      <p className="flex items-center justify-between rounded-[12px] bg-bg-2 px-3.5 py-2.5 text-[15px]">
                        <span className="text-text-2">Matricule</span>
                        <span className="font-semibold tabular-nums text-text-1">{matricule}</span>
                      </p>
                    )}
                    {!startAtForm && !registryFirst && <Field label="Adresse e-mail personnelle (facultatif)" name="personal_email" type="email" inputMode="email" autoComplete="email" value={personal} onChange={(e) => setPersonal(e.target.value)} error={fields.personal_email} hint="Pour vous joindre ou retrouver votre compte. Jamais visible des autres agents." />}
                  </>
                )}

                {step === "statut" && (
                  <div role="radiogroup" aria-label="Statut" className="grid grid-cols-2 gap-2.5">
                    {AGENT_STATUSES.map((s) => {
                      const on = status === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => {
                            setStatus(s.value);
                            setLocal({});
                          }}
                          className={cn("pressable flex min-h-[76px] flex-col justify-between rounded-[14px] px-3.5 py-3 text-left ring-1 transition-colors", on ? "bg-text-1 text-bg-0 ring-text-1" : "bg-bg-2 text-text-1 ring-transparent hover:ring-glass-edge")}
                        >
                          <span className="flex items-center justify-between text-[17px] font-semibold tracking-[-0.02em]">
                            {s.label}
                            {on && <Check size={18} strokeWidth={2.5} aria-hidden="true" />}
                          </span>
                          <span className={cn("text-[12px] leading-[1.3]", on ? "text-bg-0/80" : "text-text-3")}>{s.description}</span>
                        </button>
                      );
                    })}
                    {status && <input type="hidden" name="status" value={status} />}
                    {fields.status && (
                      <p className="col-span-2 text-[13px] text-red-text" role="alert">
                        {fields.status}
                      </p>
                    )}
                  </div>
                )}

                {step === "centre" && (
                  <div className="space-y-1.5">
                    <button type="button" onClick={() => { setPicker(true); setLocal({}); }} className="pressable flex h-12 w-full items-center justify-between rounded-[12px] bg-bg-2 px-3.5 text-left text-[15px] ring-1 ring-transparent focus:ring-glass-edge">
                      <span className={choice ? "text-text-1" : "text-text-3"}>{choice?.name ?? "Choisir mon centre ou mon service…"}</span>
                      <ChevronRight size={18} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
                    </button>
                    <p className="text-[13px] text-text-3">{fields.center_id ?? (presetRole && choice?.center_id === centerId ? `${presetRole} de ${choice?.name ?? "votre centre"} : vous êtes rattaché d'office, sans validation.` : requireCenter ? "Votre chef de centre reçoit la demande et la confirme. En attendant, vous avez accès au fil." : "Facultatif maintenant, modifiable depuis votre profil. En attendant la confirmation du chef de centre, vous avez accès au fil.")}</p>
                  </div>
                )}

                {step === "motdepasse" && (
                  <>
                    <Field label={passwordRequired ? "Mot de passe" : "Mot de passe (facultatif)"} name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={LIMITS.passwordMinLength} required={passwordRequired} error={fields.password} autoFocus />
                    <Field label="Confirmer le mot de passe" name="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required={passwordRequired} error={fields.confirm} />
                  </>
                )}

                {step === "notifications" && (
                  <div className="rounded-[14px] bg-bg-2 px-4 py-3">
                    <p className="text-[15px] text-text-1">Notifications sur cet appareil</p>
                    {pushDone === "on" ? (
                      <p className="text-[13px] text-text-2">Activées.</p>
                    ) : pushDone === "skip" ? (
                      <p className="text-[13px] text-text-3">Vous pourrez les activer plus tard depuis votre profil.</p>
                    ) : (
                      <div className="mt-2 flex items-center gap-3">
                        <Button type="button" variant="secondary" size="md" loading={pending} onClick={enablePush}>
                          Activer
                        </Button>
                        <button type="button" onClick={() => setPushDone("skip")} className="text-[15px] font-medium text-text-2 hover:text-text-1">
                          Plus tard
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {state.status === "error" && !state.fields && (
            <p className="mt-4 text-[13px] text-red-text" role="alert">
              {state.message}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            {index > 0 ? (
              <button type="button" onClick={back} className="pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-bg-2 text-text-1" aria-label="Étape précédente">
                <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ) : null}
            {index < lastIndex ? (
              <Button type="button" className="flex-1" onClick={next}>
                Suivant
              </Button>
            ) : (
              <Button type="submit" className="flex-1" loading={submitting}>
                {registryFirst ? "Terminer" : "Commencer"}
              </Button>
            )}
          </div>
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
