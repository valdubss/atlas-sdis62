"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { getVideoState, importSubtitles, removeSubtitles, resetVideoJob, saveSubtitles, setPoster, type VideoState } from "@/app/(studio)/studio/video/actions";
import { MediaUploader, type EditorMedia } from "@/components/studio/MediaUploader";
import { formatTime, type Cue } from "@/lib/video/vtt";
import { mediaUrl } from "@/lib/media/url";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const STATUS: Record<string, { label: string; tone: "neutral" | "red" | "success" | "navy" }> = {
  uploaded: { label: "Envoyée, en attente", tone: "neutral" },
  processing: { label: "Traitement en cours", tone: "navy" },
  ready: { label: "Prête", tone: "success" },
  failed: { label: "Échec", tone: "red" },
};

/** Lance ou poursuit le transcodage ; relance tant qu'il reste des rendus. */
export async function triggerTranscode(mediaId: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const res = await fetch("/api/video/transcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaId }), keepalive: true }).catch(() => null);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as { remaining?: number } | null;
    if (!json || !json.remaining) return;
  }
}

/**
 * Studio → vidéo : état du transcodage (uploaded / processing / ready / failed
 * avec la raison), poster (image ou timecode), sous-titres (.vtt / .srt,
 * génération si configurée, édition ligne par ligne, publication).
 */
export function VideoPanel({ mediaId }: { mediaId: string }) {
  const [state, setState] = useState<VideoState | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [posterImage, setPosterImage] = useState<EditorMedia[]>([]);
  const [timecode, setTimecode] = useState("1");
  const [pending, start] = useTransition();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const triggered = useRef(false);

  async function refresh() {
    const s = await getVideoState(mediaId);
    setState(s);
    if (s?.subtitles && !dirty) setCues(s.subtitles.cues);
    return s;
  }

  // Démarre le transcodage si besoin, puis sonde toutes les 5 s pendant le traitement
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const s = await refresh();
      if (!alive || !s) return;
      if ((s.video_status === "uploaded" || (s.video_status === "ready" && s.pending > 0)) && !triggered.current) {
        triggered.current = true;
        triggerTranscode(mediaId).finally(() => {
          triggered.current = false;
          if (alive) tick();
        });
      }
      if (s.video_status === "processing" || s.video_status === "uploaded" || s.pending > 0) timer = setTimeout(tick, 5000);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un cycle par média
  }, [mediaId]);

  if (!state) return null;
  const st = STATUS[state.video_status ?? "uploaded"];
  const posterUrl = state.poster_key ? `${mediaUrl(state.poster_key)}?v=${encodeURIComponent(state.poster_source + (state.poster_time_s ?? ""))}` : null;

  function updateCue(i: number, patch: Partial<Cue>) {
    setCues((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    setDirty(true);
  }

  return (
    <section className="space-y-5 rounded-[16px] bg-bg-1 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Vidéo</h2>
        <Badge tone={st.tone}>{st.label}</Badge>
        {state.renditions.length > 0 && <span className="text-[13px] text-text-3">{state.renditions.map((r) => `${r.height}p`).join(" · ")}{state.pending > 0 ? ` · ${state.pending} en cours` : ""}</span>}
        {state.orientation && <span className="text-[13px] text-text-3">{state.orientation === "portrait" ? "Vertical" : state.orientation === "landscape" ? "16:9" : "Carré"}</span>}
        {(state.video_status === "failed" || state.video_status === "processing") && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await resetVideoJob(mediaId);
                if (!r.ok) return toast(r.error);
                triggered.current = false;
                await triggerTranscode(mediaId);
                await refresh();
              })
            }
            className="pressable ml-auto flex h-9 items-center gap-1.5 rounded-[10px] bg-bg-2 px-3 text-[13px] font-medium text-text-1"
          >
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" /> Relancer
          </button>
        )}
      </div>
      {state.video_status === "failed" && state.video_error && <p className="rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] text-red-text">{state.video_error}</p>}
      {state.video_status !== "ready" && state.video_status !== "failed" && <p className="text-[13px] text-text-3">La publication reste possible : le MP4 est servi tel quel, puis les qualités 360p / 720p / 1080p prennent le relais dès qu&apos;elles sont prêtes.</p>}

      <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-text-2">Poster</p>
          <div className="aspect-video overflow-hidden rounded-[12px] bg-bg-2">
            {posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- image du stockage
              <img src={posterUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <p className="text-[12px] text-text-3">{state.poster_source === "auto" ? "Extrait automatiquement à 1 s" : state.poster_source === "timecode" ? `Image à ${formatTime(state.poster_time_s ?? 0).slice(3)}` : "Image envoyée"}</p>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="block text-[13px] font-medium text-text-2">Instant (secondes)</span>
              <input value={timecode} onChange={(e) => setTimecode(e.target.value)} inputMode="decimal" className="mt-1 h-10 w-28 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none" aria-label="Instant du poster en secondes" />
            </label>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={pending || state.video_status !== "ready"}
              onClick={() =>
                start(async () => {
                  const r = await setPoster(mediaId, { timeS: Number(timecode.replace(",", ".")) });
                  toast(r.ok ? "Poster mis à jour" : r.error);
                  await refresh();
                })
              }
            >
              Extraire l&apos;image
            </Button>
          </div>
          <MediaUploader accept="screenshot" items={posterImage} onChange={setPosterImage} />
          {posterImage.some((m) => m.status === "ready") && (
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setPoster(mediaId, { imageMediaId: posterImage.find((m) => m.status === "ready")!.id });
                  toast(r.ok ? "Poster remplacé" : r.error);
                  setPosterImage([]);
                  await refresh();
                })
              }
            >
              Utiliser cette image comme poster
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-text-2">Sous-titres</p>
          {state.subtitles && <Badge tone={state.subtitles.status === "published" ? "success" : "neutral"}>{state.subtitles.status === "published" ? "Publiés" : "Brouillon"}</Badge>}
          <span className="flex-1" />
          <input
            ref={fileRef}
            type="file"
            accept=".vtt,.srt,text/vtt"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              f.text().then((text) =>
                start(async () => {
                  const r = await importSubtitles(mediaId, text);
                  if (!r.ok) return toast(r.error);
                  setCues(r.cues);
                  setDirty(false);
                  toast(`${r.cues.length} lignes importées`);
                  await refresh();
                }),
              );
            }}
          />
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
            Importer .vtt / .srt
          </Button>
          {state.transcription_enabled && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || state.video_status !== "ready"}
              onClick={() =>
                start(async () => {
                  const res = await fetch("/api/video/subtitles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaId }) });
                  const json = (await res.json().catch(() => ({}))) as { cues?: Cue[]; error?: string };
                  if (!res.ok || !json.cues) return toast(json.error ?? "Génération impossible");
                  setCues(json.cues);
                  setDirty(false);
                  toast(`${json.cues.length} lignes générées : relisez avant de publier`);
                })
              }
            >
              Générer
            </Button>
          )}
        </div>
        {cues.length === 0 ? (
          <p className="text-[13px] text-text-3">Aucun sous-titre. Importez un fichier WebVTT ou SRT{state.transcription_enabled ? ", ou générez-les" : ""} ; chaque ligne reste modifiable avant publication. Ils s&apos;affichent quand le son est coupé.</p>
        ) : (
          <>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {cues.map((c, i) => (
                <li key={i} className={cn("grid grid-cols-[72px_72px_minmax(0,1fr)_32px] items-center gap-2", !c.text.trim() && "opacity-50")}>
                  <input value={formatTime(c.start).slice(3)} onChange={(e) => updateCue(i, { start: parseClock(e.target.value, c.start) })} aria-label="Début" className="h-9 rounded-[8px] bg-bg-2 px-2 text-[12px] tabular-nums text-text-2 outline-none" />
                  <input value={formatTime(c.end).slice(3)} onChange={(e) => updateCue(i, { end: parseClock(e.target.value, c.end) })} aria-label="Fin" className="h-9 rounded-[8px] bg-bg-2 px-2 text-[12px] tabular-nums text-text-2 outline-none" />
                  <input value={c.text} onChange={(e) => updateCue(i, { text: e.target.value })} aria-label={`Ligne ${i + 1}`} maxLength={300} className="h-9 min-w-0 rounded-[8px] bg-bg-2 px-2.5 text-[13px] text-text-1 outline-none" />
                  <button type="button" onClick={() => { setCues((p) => p.filter((_, j) => j !== i)); setDirty(true); }} aria-label="Supprimer la ligne" className="h-9 text-[13px] text-text-3 hover:text-red-text">
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="md" disabled={pending} onClick={() => start(async () => { const r = await saveSubtitles(mediaId, cues, true); toast(r.ok ? "Sous-titres publiés" : r.error); setDirty(false); await refresh(); })}>
                Publier les sous-titres
              </Button>
              <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => start(async () => { const r = await saveSubtitles(mediaId, cues, false); toast(r.ok ? "Brouillon enregistré" : r.error); setDirty(false); await refresh(); })}>
                Enregistrer le brouillon
              </Button>
              <Button type="button" variant="danger" size="md" disabled={pending} onClick={() => confirm("Supprimer les sous-titres ?") && start(async () => { await removeSubtitles(mediaId); setCues([]); setDirty(false); await refresh(); })}>
                Supprimer
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** « mm:ss.mmm » ou « ss » → secondes ; valeur précédente si illisible. */
function parseClock(s: string, fallback: number) {
  const t = s.trim().replace(",", ".");
  const m = /^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/.exec(t);
  if (m) return Number(m[1] ?? 0) * 60 + Number(m[2]) + Number((m[3] ?? "0").padEnd(3, "0")) / 1000;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}
