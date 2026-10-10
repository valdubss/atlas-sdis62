"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, Newspaper, CircleDot } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { CenterPicker } from "@/components/centre/CenterPicker";
import type { Directory } from "@/lib/centres/public";
import { ChevronRight } from "lucide-react";
import { LIMITS } from "@/lib/config";
import { SPRING } from "@/lib/motion";
import { pushSupported, subscribeBrowser } from "@/lib/push/client";
import { savePushSubscription } from "@/app/(app)/profil/notifications-actions";
import { cn } from "@/lib/cn";

const SLIDES = [
  { icon: Newspaper, title: "Le fil", text: "Les actualités du SDIS 62 publiées par le service communication : interventions, vie des centres, formations, cérémonies. Réagissez, commentez, gardez en favori." },
  { icon: CircleDot, title: "Les stories", text: "En haut du fil, des moments en photo ou en vidéo qui disparaissent après 48 heures. Touchez pour avancer, maintenez pour mettre en pause." },
  { icon: Bell, title: "Les notifications", text: "Soyez prévenu des nouvelles publications et des annonces importantes. Vous choisissez ce que vous recevez, et vous pouvez changer d'avis à tout moment." },
];

const initial: OnboardingState = { status: "idle" };

/**
 * Accueil de première connexion : trois écrans plein cadre, puis profil
 * (prénom, nom, centre, mot de passe si arrivée par lien) et activation des push.
 */
export function Onboarding({ firstName, lastName, centerId, directory, needPassword, startAtForm = false }: { firstName: string; lastName: string; centerId: string | null; directory: Directory; needPassword: boolean; startAtForm?: boolean }) {
  const [step, setStep] = useState(startAtForm ? SLIDES.length : 0);
  const [picker, setPicker] = useState(false);
  const [choice, setChoice] = useState<{ center_id: string | null; service_id: string | null; name: string } | null>(() => {
    const c = centerId ? directory.centers.find((x) => x.id === centerId) : null;
    return c ? { center_id: c.id, service_id: null, name: c.name } : null;
  });
  const [pushDone, setPushDone] = useState<null | "on" | "skip">(null);
  const [pending, start] = useTransition();
  const [state, action, submitting] = useActionState(completeOnboarding, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};
  const reduced = useReducedMotion();
  const last = SLIDES.length; // index de l'étape formulaire

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

  return (
    <div className="flex min-h-dvh flex-col bg-bg-0">
      {/* Progression */}
      <div className="flex gap-1 px-5 pt-[max(env(safe-area-inset-top),16px)]" aria-hidden="true">
        {[...SLIDES, null].map((_, i) => (
          <span key={i} className={cn("h-[2px] flex-1 rounded-full", i <= step ? "bg-text-1" : "bg-line-strong")} />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step < last ? (
          <motion.section
            key={step}
            initial={reduced ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24, transition: { duration: 0.16 } }}
            transition={SPRING}
            className="flex flex-1 flex-col justify-end px-5 pb-[max(env(safe-area-inset-bottom),24px)] sm:mx-auto sm:w-full sm:max-w-[480px] sm:justify-center"
            aria-live="polite"
          >
            {(() => {
              const Icon = SLIDES[step].icon;
              return <Icon size={40} strokeWidth={1.5} className="mb-6 text-text-2" aria-hidden="true" />;
            })()}
            <h1 className="text-[34px] font-semibold tracking-[-0.02em] leading-[1.15] text-text-1">{SLIDES[step].title}</h1>
            <p className="mt-3 text-[17px] leading-[1.45] text-text-2">{SLIDES[step].text}</p>
            <div className="mt-10 flex items-center justify-between">
              <button type="button" onClick={() => setStep(last)} className="text-[15px] font-medium text-text-2 hover:text-text-1">
                Passer
              </button>
              <Button onClick={() => setStep((s) => s + 1)}>{step === last - 1 ? "Configurer" : "Suivant"}</Button>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="form"
            initial={reduced ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={SPRING}
            className="flex flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-6 sm:mx-auto sm:w-full sm:max-w-[480px] sm:justify-center"
          >
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.15] text-text-1">{firstName ? `Bonjour ${firstName}` : "Votre profil"}</h1>
            <p className="mt-1 text-[15px] text-text-2">Ces informations apparaissent dans vos commentaires. Elles restent internes au SDIS.</p>

            <form action={action} className="mt-6 space-y-4" noValidate>
              <input type="hidden" name="need_password" value={needPassword ? "1" : "0"} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prénom" name="first_name" defaultValue={firstName} autoComplete="given-name" required error={fields.first_name} />
                <Field label="Nom" name="last_name" defaultValue={lastName} autoComplete="family-name" required error={fields.last_name} />
              </div>
              <input type="hidden" name="center_id" value={choice?.center_id ?? ""} />
              <input type="hidden" name="service_id" value={choice?.service_id ?? ""} />
              <div className="space-y-1.5">
                <span className="block text-[13px] font-medium text-text-2">Centre ou service</span>
                <button type="button" onClick={() => setPicker(true)} className="pressable flex h-11 w-full items-center justify-between rounded-[10px] bg-bg-1 px-3.5 text-left text-[15px] ring-1 ring-transparent focus:ring-glass-edge">
                  <span className={choice ? "text-text-1" : "text-text-3"}>{choice?.name ?? "Choisir mon centre…"}</span>
                  <ChevronRight size={18} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
                </button>
                <p className="text-[13px] text-text-3">{fields.center_id ?? "Votre chef de centre reçoit une demande et confirme votre arrivée. En attendant, vous avez accès au fil."}</p>
              </div>
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
              {needPassword && (
                <>
                  <Field label="Mot de passe (facultatif)" name="password" type="password" autoComplete="new-password" minLength={LIMITS.passwordMinLength} hint={`${LIMITS.passwordMinLength} caractères minimum. Sans mot de passe, vous vous connectez par e-mail (lien ou code).`} error={fields.password} />
                  <Field label="Confirmer le mot de passe" name="confirm" type="password" autoComplete="new-password" error={fields.confirm} />
                </>
              )}

              <div className="rounded-[16px] bg-bg-1 px-4 py-3">
                <p className="text-[15px] text-text-1">Notifications</p>
                {pushDone === "on" ? (
                  <p className="text-[13px] text-text-2">Activées sur cet appareil.</p>
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

              {state.status === "error" && !state.fields && (
                <p className="text-[13px] text-red-text" role="alert">
                  {state.message}
                </p>
              )}
              <Button type="submit" className="w-full" loading={submitting}>
                Commencer
              </Button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
