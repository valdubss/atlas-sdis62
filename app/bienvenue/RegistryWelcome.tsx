"use client";

import { useActionState, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronRight, Eye, EyeOff, IdCard, KeyRound, MapPin, PartyPopper, Shield } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Logo } from "@/components/brand/Logo";
import { CenterPicker } from "@/components/centre/CenterPicker";
import type { Directory } from "@/lib/centres/public";
import { APP_NAME, LIMITS } from "@/lib/config";
import { SPRING } from "@/lib/motion";
import { AGENT_STATUSES, AGENT_STATUS_LABELS, type AgentStatusValue } from "@/lib/auth/first-access-public";
import { cn } from "@/lib/cn";

const initial: OnboardingState = { status: "idle" };

// Apparition en cascade : la fenêtre monte, puis chaque bloc arrive l'un après l'autre
const list = { hidden: {}, shown: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } };
const item = { hidden: { opacity: 0, y: 14 }, shown: { opacity: 1, y: 0, transition: SPRING } };

/**
 * Fenêtre de bienvenue de la première connexion par matricule : pop-up centrée (feuille
 * en bas sur mobile) avec un bandeau rouge à l'identité de l'agent (nom, matricule, statut
 * repris de la liste), puis un seul écran de réglages : statut s'il manque, centre (le chef
 * de centre confirme l'appartenance) et mot de passe. Un champ caché « username » permet au
 * gestionnaire de mots de passe du téléphone d'enregistrer le couple adresse + mot de passe.
 * L'envoi mène directement au fil.
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
  const reduced = useReducedMotion();
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
  const remaining = [!knownStatus && "votre statut", "votre centre", "un mot de passe"].filter(Boolean) as string[];
  const remainingText = remaining.length > 2 ? `${remaining.slice(0, -1).join(", ")} et ${remaining.at(-1)}` : remaining.join(" et ");

  return (
    <div className="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-bg-0 sm:items-center sm:justify-center sm:py-8">
      {/* Fond : halo rouge derrière la fenêtre */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_25%,rgba(215,31,54,0.26),transparent_70%)]" />

      <motion.form
        action={action}
        onSubmit={check}
        noValidate
        initial={reduced ? false : { opacity: 0, y: 48, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SPRING, stiffness: 300, damping: 30 }}
        className="relative mx-auto w-full max-w-[460px] sm:px-5"
      >
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

        <section className="overflow-hidden rounded-t-[28px] bg-bg-1 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.6)] ring-1 ring-glass-edge sm:rounded-[28px]" aria-label="Bienvenue">
          {/* Bandeau : logo, médaillon, nom de l'agent et ce que la liste sait déjà */}
          <motion.header variants={list} initial={reduced ? false : "hidden"} animate="shown" className="relative overflow-hidden bg-[linear-gradient(155deg,#e4213a_0%,#b4162a_55%,#7d0f1e_100%)] px-6 pb-6 pt-6 text-white">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-black/20 blur-2xl" />

            <motion.div variants={item} className="flex items-center justify-between">
              <Logo height={22} />
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 ring-1 ring-white/20">Première connexion</span>
            </motion.div>

            <motion.div variants={item} className="mt-6 flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/25">
              <PartyPopper size={30} strokeWidth={1.75} aria-hidden="true" />
            </motion.div>

            <motion.h1 variants={item} className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em]" style={{ color: "#fff" }}>
              <span className="block text-[17px] font-medium tracking-[-0.01em] text-white/85">Bienvenue</span>
              {name ? ` ${name}` : null}
            </motion.h1>
            <motion.p variants={item} className="mt-2 text-[15px] leading-[1.45] text-white/80">
              Votre matricule est reconnu. Il ne manque que {remainingText}, et vous êtes sur {APP_NAME}.
            </motion.p>

            {(matricule || knownStatus) && (
              <motion.ul variants={item} className="mt-4 flex flex-wrap gap-2" aria-label="Repris de la liste des agents">
                {matricule && (
                  <li className="flex items-center gap-1.5 rounded-full bg-black/20 py-1.5 pl-2.5 pr-3 text-[13px] font-medium ring-1 ring-white/15">
                    <IdCard size={15} strokeWidth={1.75} aria-hidden="true" className="text-white/80" />
                    <span className="sr-only">Matricule </span>
                    <span className="tabular-nums">{matricule}</span>
                  </li>
                )}
                {knownStatus && (
                  <li className="flex items-center gap-1.5 rounded-full bg-black/20 py-1.5 pl-2.5 pr-3 text-[13px] font-medium ring-1 ring-white/15">
                    <Shield size={15} strokeWidth={1.75} aria-hidden="true" className="text-white/80" />
                    <span className="sr-only">Statut </span>
                    {AGENT_STATUS_LABELS[knownStatus]}
                  </li>
                )}
              </motion.ul>
            )}
          </motion.header>

          <motion.div variants={list} initial={reduced ? false : "hidden"} animate="shown" className="space-y-5 px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 sm:px-6 sm:pb-6">
            {!knownStatus && (
              <motion.div variants={item} className="space-y-2">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-2">
                  <Shield size={14} strokeWidth={1.75} aria-hidden="true" />
                  Statut
                </p>
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
              </motion.div>
            )}

            <motion.div variants={item} className="space-y-2">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-2">
                <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
                Centre ou service
              </p>
              <button
                type="button"
                onClick={() => {
                  setPicker(true);
                  clear("center_id");
                }}
                className={cn("pressable flex h-12 w-full items-center justify-between rounded-[12px] bg-bg-2 px-3.5 text-left text-[15px] ring-1", fields.center_id ? "ring-red" : choice ? "ring-glass-edge" : "ring-transparent")}
              >
                <span className={cn("truncate", choice ? "font-medium text-text-1" : "text-text-3")}>{choice?.name ?? "Choisir mon centre ou mon service…"}</span>
                {choice ? <Check size={18} strokeWidth={2.25} className="shrink-0 text-success" aria-hidden="true" /> : <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />}
              </button>
              <p className={cn("text-[13px]", fields.center_id ? "text-red-text" : "text-text-3")} role={fields.center_id ? "alert" : undefined}>
                {fields.center_id ?? "Votre chef de centre confirme que vous en faites partie. En attendant, vous avez accès au fil."}
              </p>
            </motion.div>

            <motion.div variants={item} className="space-y-2">
              <label htmlFor="welcome-password" className="flex items-center gap-1.5 text-[13px] font-medium text-text-2">
                <KeyRound size={14} strokeWidth={1.75} aria-hidden="true" />
                Mot de passe
              </label>
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
            </motion.div>

            {state.status === "error" && !state.fields && (
              <p className="text-[13px] text-red-text" role="alert">
                {state.message}
              </p>
            )}

            <motion.div variants={item} className="pt-1">
              <Button type="submit" className="w-full" loading={submitting}>
                Entrer dans {APP_NAME}
                {!submitting && <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />}
              </Button>
            </motion.div>
          </motion.div>
        </section>
      </motion.form>

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
