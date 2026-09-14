"use client";

import { useState, useTransition } from "react";
import { flushQueue, sendDigestTest, setAppSetting, setDigestEnabled } from "@/app/(studio)/studio/parametres/actions";
import { CheckboxField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Stats = { subscribers: number; devices: number; digest_recipients: number; pending: number; sent_7d: number };
type AuthPrefs = { passwordEnabled: boolean; magicLinkEnabled: boolean; ssoForced: boolean; ssoConfigured: boolean; feedbackEmail: string };

export function SettingsPanel({
  isAdmin,
  digestEnabled: initial,
  stats,
  auth: initialAuth,
  emailConfigured,
  pushConfigured,
}: {
  isAdmin: boolean;
  digestEnabled: boolean;
  stats: Stats;
  auth: AuthPrefs;
  emailConfigured: boolean;
  pushConfigured: boolean;
}) {
  const [digest, setDigest] = useState(initial);
  const [auth, setAuth] = useState(initialAuth);
  const [feedbackEmail, setFeedbackEmail] = useState(initialAuth.feedbackEmail);

  function toggleAuth(key: "auth_password_enabled" | "auth_magic_link_enabled" | "auth_sso_forced", field: keyof AuthPrefs, value: boolean) {
    setAuth((a) => ({ ...a, [field]: value }));
    start(async () => {
      const r = await setAppSetting(key, value);
      if (!r.ok) {
        setAuth((a) => ({ ...a, [field]: !value }));
        toast(r.error);
      } else toast("Réglage enregistré");
    });
  }
  const [testTo, setTestTo] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Paramètres</h1>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Notifications push</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Agents abonnés", stats.subscribers],
            ["Appareils", stats.devices],
            ["En attente", stats.pending],
            ["Envoyées sur 7 jours", stats.sent_7d],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[16px] bg-bg-1 px-5 py-4">
              <p className="text-[13px] text-text-2">{label}</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-text-1">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-text-3">
          {pushConfigured
            ? "Une notification part à chaque mise en ligne, immédiatement puis par le cron toutes les cinq minutes en secours."
            : "Clés VAPID absentes : renseignez NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY."}
        </p>
        {isAdmin && (
          <Button
            variant="secondary"
            size="md"
            disabled={pending || !pushConfigured}
            onClick={() =>
              start(async () => {
                const r = await flushQueue();
                toast(r.ok ? (r.message ?? "File traitée") : r.error);
              })
            }
          >
            Traiter la file maintenant
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Connexion</h2>
        <div className="hairline rounded-[16px] bg-bg-1 [&>*]:px-5">
          <div className="py-2">
            <CheckboxField label="Connexion Microsoft obligatoire" name="auth_sso_forced" checked={auth.ssoForced} disabled={pending || !isAdmin || !auth.ssoConfigured} onChange={(e) => toggleAuth("auth_sso_forced", "ssoForced", e.target.checked)} hint={auth.ssoConfigured ? "Désactive le mot de passe et le lien e-mail" : "Disponible une fois le SSO Microsoft configuré (docs/SSO-ENTRA.md)"} />
          </div>
          <div className="py-2">
            <CheckboxField label="Connexion par mot de passe" name="auth_password_enabled" checked={auth.passwordEnabled} disabled={pending || !isAdmin || auth.ssoForced} onChange={(e) => toggleAuth("auth_password_enabled", "passwordEnabled", e.target.checked)} />
          </div>
          <div className="py-2">
            <CheckboxField label="Connexion par lien e-mail" name="auth_magic_link_enabled" checked={auth.magicLinkEnabled} disabled={pending || !isAdmin || auth.ssoForced} onChange={(e) => toggleAuth("auth_magic_link_enabled", "magicLinkEnabled", e.target.checked)} hint="Sert aussi à la première connexion et au mot de passe oublié" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Signalements des agents</h2>
        <form
          className="flex flex-wrap items-center gap-2 rounded-[16px] bg-bg-1 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await setAppSetting("feedback_email", feedbackEmail.trim());
              toast(r.ok ? "Adresse enregistrée" : r.error);
            });
          }}
        >
          <label htmlFor="feedback_email" className="w-full text-[13px] font-medium text-text-2">
            Adresse qui reçoit les signalements
          </label>
          <input id="feedback_email" type="email" value={feedbackEmail} onChange={(e) => setFeedbackEmail(e.target.value)} disabled={!isAdmin} className="h-10 w-72 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge" />
          <Button type="submit" variant="secondary" size="md" disabled={pending || !isAdmin}>
            Enregistrer
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Résumé hebdomadaire par e-mail</h2>
        <div className="hairline rounded-[16px] bg-bg-1 [&>*]:px-5">
          <div className="py-2">
            <CheckboxField
              label="Envoyer le résumé chaque lundi matin"
              name="digest_enabled"
              checked={digest}
              disabled={pending || !isAdmin}
              onChange={(e) => {
                const v = e.target.checked;
                setDigest(v);
                start(async () => {
                  const r = await setDigestEnabled(v);
                  if (!r.ok) {
                    setDigest(!v);
                    toast(r.error);
                  } else toast(v ? "Résumé hebdomadaire activé" : "Résumé hebdomadaire désactivé");
                });
              }}
              hint={`${stats.digest_recipients} destinataire(s) ont gardé l'option dans leur profil`}
            />
          </div>
          {isAdmin && (
            <form
              className="flex flex-wrap items-center gap-2 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await sendDigestTest(testTo.trim());
                  toast(r.ok ? (r.message ?? "Envoyé") : r.error);
                });
              }}
            >
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="Adresse de test"
                aria-label="Adresse de test"
                required
                className="h-10 w-72 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
              />
              <Button type="submit" variant="secondary" size="md" disabled={pending || !emailConfigured}>
                Envoyer un test
              </Button>
              {!emailConfigured && <span className="text-[13px] text-text-3">Renseignez RESEND_API_KEY ou SMTP_HOST pour activer l&apos;envoi.</span>}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
