"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { followCenter, updateCenterSettings } from "@/app/(app)/centre/actions";
import type { CenterSummary, Directory } from "@/lib/centres/public";
import type { Profile } from "@/lib/supabase/database.types";
import { ChangeCenterFlow, type ProfileHistoryEntry } from "./ChangeCenterFlow";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

/** Profil → Mon centre : rattachement, centres suivis, présentation et annuaire. */
export function CenterSettingsForm({ profile, home, follows, directory, history }: { profile: Profile; home: { name: string; href: string } | null; follows: CenterSummary[]; directory: Directory; history: ProfileHistoryEntry[] }) {
  const [presentMe, setPresentMe] = useState(profile.present_me);
  const [visible, setVisible] = useState(profile.directory_visible);
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? "");
  const [workPhone, setWorkPhone] = useState(profile.work_phone ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function save(extra?: Partial<{ present_me: boolean; directory_visible: boolean }>) {
    start(async () => {
      const r = await updateCenterSettings({ job_title: jobTitle, work_phone: workPhone, present_me: presentMe, directory_visible: visible, ...extra });
      toast(r.ok ? "Enregistré" : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ChangeCenterFlow home={home} directory={directory} history={history} currentCenterId={profile.center_id} currentServiceId={profile.service_id} />

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          Centres suivis <span className="text-text-3">{follows.length}/3</span>
        </h2>
        <p className="mt-1 text-[13px] text-text-3">Leurs actus restent sur leur page ; le fil ne change pas. Pour suivre un centre, ouvrez sa page depuis l&apos;annuaire.</p>
        {follows.length > 0 && (
          <ul className="mt-3 space-y-2">
            {follows.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <Link href={`/centre/${c.slug}`} className="min-w-0 flex-1 truncate text-[15px] text-text-1">
                  {c.name}
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Ne plus suivre ${c.name}`}
                  onClick={() =>
                    start(async () => {
                      const r = await followCenter(c.id, false);
                      toast(r.ok ? "Centre retiré" : r.error);
                      router.refresh();
                    })
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full text-text-3 hover:text-text-1"
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Sur la page du centre et dans l&apos;annuaire</h2>
        <CheckboxField
          label="Je souhaite être présenté"
          name="present_me"
          checked={presentMe}
          disabled={pending}
          onChange={(e) => {
            setPresentMe(e.target.checked);
            save({ present_me: e.target.checked });
          }}
          hint="Pendant vos 60 premiers jours, votre prénom et votre photo apparaissent dans « Bienvenue à » sur la page du centre"
        />
        <CheckboxField
          label="Visible dans l'annuaire"
          name="directory_visible"
          checked={visible}
          disabled={pending}
          onChange={(e) => {
            setVisible(e.target.checked);
            save({ directory_visible: e.target.checked });
          }}
          hint="Nom, fonction et téléphone professionnel visibles par les agents connectés"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fonction (facultatif)" name="job_title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={60} placeholder="Chef d'agrès, secrétaire…" />
          <Field label="Téléphone professionnel (facultatif)" name="work_phone" value={workPhone} onChange={(e) => setWorkPhone(e.target.value)} maxLength={30} inputMode="tel" />
        </div>
        <Button type="button" variant="secondary" loading={pending} onClick={() => save()}>
          Enregistrer
        </Button>
      </section>
    </div>
  );
}
