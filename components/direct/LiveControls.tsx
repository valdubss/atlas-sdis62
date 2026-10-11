"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Radio, Square } from "lucide-react";
import { endLive, liveStreamConfig, startLive, type LiveStreamConfig } from "@/app/(studio)/studio/direct/actions";
import type { LiveItem } from "@/lib/direct/types";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";

/**
 * Commandes du service communication sur un Direct : lancer, terminer (récapitulatif généré),
 * et, pour la vidéo, l'adresse RTMP et la clé de diffusion à coller dans Larix ou OBS.
 */
export function LiveControls({ live }: { live: LiveItem }) {
  const [config, setConfig] = useState<LiveStreamConfig | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (live.video) liveStreamConfig().then(setConfig);
  }, [live.video]);

  function copy(label: string, value: string) {
    navigator.clipboard?.writeText(value).then(
      () => toast(`${label} copiée`),
      () => toast("Copie impossible : sélectionnez le texte"),
    );
  }

  return (
    <section className="space-y-3 rounded-[16px] bg-bg-1 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {live.status === "draft" && (
          <Button
            type="button"
            size="md"
            loading={pending}
            onClick={() =>
              confirm({ title: "Lancer le direct ?", message: "Il sera épinglé en tête du fil et tous les agents recevront une notification.", confirmLabel: "Lancer" }).then((ok) => {
                if (!ok) return;
                start(async () => {
                  const r = await startLive(live.id);
                  toast(r.ok ? "Direct lancé" : r.error);
                  if (r.ok) router.refresh();
                });
              })
            }
          >
            <Radio size={16} strokeWidth={2} aria-hidden="true" /> Lancer le direct
          </Button>
        )}
        {live.status === "live" && (
          <Button
            type="button"
            size="md"
            variant="secondary"
            loading={pending}
            onClick={() =>
              confirm({ title: "Terminer le direct ?", message: "Une publication récapitulative sera créée dans le fil avec la chronologie et les photos.", confirmLabel: "Terminer", danger: true }).then((ok) => {
                if (!ok) return;
                start(async () => {
                  const r = await endLive(live.id);
                  toast(r.ok ? "Direct terminé, récapitulatif publié" : r.error);
                  if (r.ok) router.refresh();
                });
              })
            }
          >
            <Square size={16} strokeWidth={2} aria-hidden="true" /> Terminer le direct
          </Button>
        )}
        {live.status === "ended" && <p className="text-[15px] text-text-2">Direct terminé{live.ended_at ? ` le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(live.ended_at))}` : ""}.</p>}
      </div>

      {live.video && live.status !== "ended" && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[13px] font-semibold text-text-2">Diffusion vidéo (Bunny Stream)</p>
          {config && !config.configured && <p className="text-[13px] text-red-text">Clé de diffusion non configurée : variables LIVE_RTMP_URL, LIVE_STREAM_KEY et NEXT_PUBLIC_LIVE_HLS_URL sur Vercel (voir README).</p>}
          {config?.configured && (
            <>
              <Row label="Adresse RTMP" value={config.rtmpUrl!} onCopy={() => copy("Adresse", config.rtmpUrl!)} />
              <Row label="Clé de diffusion" value={showKey ? config.streamKey! : "••••••••••••••••"} onCopy={() => copy("Clé", config.streamKey!)} extra={<button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Masquer la clé" : "Afficher la clé"} className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bg-2 text-text-2">{showKey ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}</button>} />
              <p className="text-[13px] text-text-3">Depuis un téléphone : appli Larix Broadcaster (gratuite), connexion RTMP avec l&apos;adresse et la clé. Depuis un ordinateur ou une caméra : OBS, vMix, encodeur. La vidéo apparaît dans ATLAS quelques secondes après le début de la diffusion.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ label, value, onCopy, extra }: { label: string; value: string; onCopy: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-text-3">{label}</span>
        <span className="block truncate font-mono text-[13px] text-text-1">{value}</span>
      </span>
      {extra}
      <button type="button" onClick={onCopy} aria-label={`Copier ${label.toLowerCase()}`} className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bg-2 text-text-2">
        <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
