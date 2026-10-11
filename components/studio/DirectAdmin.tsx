"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { createLive, deleteLive } from "@/app/(studio)/studio/direct/actions";
import type { LiveItem } from "@/lib/direct/types";
import { LIVE_LIMITS } from "@/lib/direct/types";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field, SelectField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";

const STATUS: Record<LiveItem["status"], { label: string; tone: "neutral" | "red" | "success" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  live: { label: "En direct", tone: "red" },
  ended: { label: "Terminé", tone: "success" },
};

/** Studio → Direct : création (titre, lieu, centre, vidéo) et liste des Directs. */
export function DirectAdmin({ lives, centers, videoConfigured }: { lives: LiveItem[]; centers: { id: string; name: string }[]; videoConfigured: boolean }) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [centerId, setCenterId] = useState("");
  const [video, setVideo] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const active = lives.find((l) => l.status === "live");

  function create() {
    start(async () => {
      const r = await createLive({ title, location, center_id: centerId || null, video });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      router.push(`/direct/${r.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Direct</h1>
        <p className="text-[13px] text-text-3">Un fil minute par minute pendant une opération ou une cérémonie, épinglé en tête du fil, avec vidéo en direct si besoin. Un seul direct actif à la fois ; à la clôture, un récapitulatif est publié.</p>
      </div>

      {active && (
        <Link href={`/direct/${active.id}`} className="pressable flex items-center gap-3 rounded-[16px] bg-red-fill px-4 py-3 text-white">
          <Radio size={18} strokeWidth={2} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">En direct : {active.title}</span>
          <span className="text-[13px] opacity-90">Ouvrir</span>
        </Link>
      )}

      <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Nouveau direct</h2>
        <Field label="Titre" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIVE_LIMITS.titleMax} placeholder="Feu de végétation à Hesdin" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lieu (facultatif)" name="location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={LIVE_LIMITS.locationMax} placeholder="Hesdin, D928" />
          <SelectField label="Centre concerné (facultatif)" name="center_id" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">Tout le SDIS</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="text-[13px] text-text-3">Depuis l&apos;app : texte, photos et clips vidéo de 90 s filmés sur place, visibles dans le direct une minute après l&apos;envoi, sans rien installer.</p>
        <CheckboxField label="Flux vidéo continu en plus (encodeur externe ou caméra, clé RTMP Bunny)" name="video" checked={video} onChange={(e) => setVideo(e.target.checked)} />
        {video && !videoConfigured && <p className="text-[13px] text-red-text">Flux continu non configuré sur ce déploiement (variables LIVE_* sur Vercel, voir README). Le direct fonctionnera avec texte, photos et clips.</p>}
        <Button type="button" size="md" loading={pending} disabled={!title.trim()} onClick={create}>
          Créer le direct
        </Button>
        <p className="text-[13px] text-text-3">Le direct est créé en brouillon : vous le lancez depuis sa page quand vous êtes prêt.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          Directs <span className="text-text-3">{lives.length}</span>
        </h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {lives.length === 0 && <p className="px-5 py-4 text-[15px] text-text-2">Aucun direct pour le moment.</p>}
          {lives.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-5 py-3">
              <Link href={`/direct/${l.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-text-1">{l.title}</span>
                <span className="block truncate text-[13px] text-text-3">
                  {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(l.started_at ?? l.created_at))}
                  {l.location ? ` · ${l.location}` : ""}
                  {l.video ? " · vidéo" : ""}
                </span>
              </Link>
              <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
              {l.status !== "live" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    confirm({ title: `Supprimer « ${l.title} » ?`, message: l.recap_post_id ? "Le récapitulatif publié reste dans le fil." : undefined, confirmLabel: "Supprimer", danger: true }).then((ok) => {
                      if (!ok) return;
                      start(async () => {
                        const r = await deleteLive(l.id);
                        toast(r.ok ? "Direct supprimé" : r.error);
                        if (r.ok) router.refresh();
                      });
                    })
                  }
                  className="pressable shrink-0 text-[13px] font-medium text-text-3 hover:text-red-text"
                >
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
