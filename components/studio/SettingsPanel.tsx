"use client";

import { useState, useTransition } from "react";
import { flushQueue, sendDigestTest, setDigestEnabled } from "@/app/(studio)/studio/parametres/actions";
import { CheckboxField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Stats = { subscribers: number; devices: number; digest_recipients: number; pending: number; sent_7d: number };

export function SettingsPanel({
  isAdmin,
  digestEnabled: initial,
  stats,
  emailConfigured,
  pushConfigured,
}: {
  isAdmin: boolean;
  digestEnabled: boolean;
  stats: Stats;
  emailConfigured: boolean;
  pushConfigured: boolean;
}) {
  const [digest, setDigest] = useState(initial);
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
