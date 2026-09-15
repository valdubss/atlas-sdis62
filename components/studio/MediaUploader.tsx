"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Upload, X } from "lucide-react";
import { completeMultipart, createUpload, discardMedia, finalizeMedia, presignMultipartPart } from "@/app/(studio)/studio/media/actions";
import { altAssistEnabled, suggestAlt } from "@/app/(studio)/studio/media/alt-actions";
import { prepareFile, uploadWithProgress } from "@/lib/media/client";
import { uploadFile } from "@/lib/media/uploader";
import { fingerprintFile } from "@/lib/media/fingerprint";
import { uploadQueue } from "@/lib/media/queue";
import type { MediaItem } from "@/lib/feed/types";
import { LIMITS } from "@/lib/config";
import { imageSrc, posterSrc } from "@/lib/media/url";
import { cn } from "@/lib/cn";

/** Média dans l'éditeur : un MediaItem enrichi de son état d'upload. */
export type EditorMedia = MediaItem & {
  status: "preparing" | "uploading" | "processing" | "ready" | "error";
  progress: number;
  error?: string;
  /** Libellé de l'étape en cours (« Compression 42 % ») */
  label?: string;
  /** Avertissement non bloquant (ex. vidéo très lourde, doublon) */
  warning?: string;
  /** Texte alternatif proposé par l'assistance (à relire) */
  alt_source?: "manual" | "assisted";
  /** Légende affichée sous la photo dans la publication (200 caractères) */
  caption?: string | null;
};

type Accept = "images" | "video" | "cover" | "center_cover" | "story" | "screenshot";

const LABELS: Record<Accept, { title: string; hint: string; max: number; kinds: ("image" | "video")[] }> = {
  images: { title: "Photos", hint: `Glissez vos photos ou touchez pour choisir, jusqu'à ${LIMITS.imagesPerPost}. JPG, PNG, WebP, HEIC.`, max: LIMITS.imagesPerPost, kinds: ["image"] },
  video: { title: "Vidéo", hint: `Une vidéo MP4 (H.264), ${Math.round(LIMITS.videoMaxBytes / 1048576)} Mo au plus. MOV accepté si H.264.`, max: 1, kinds: ["video"] },
  cover: { title: "Image de couverture (facultatif)", hint: "Une image affichée en tête de l'article.", max: 1, kinds: ["image"] },
  center_cover: { title: "Photo de couverture (facultatif)", hint: "Photo de la caserne ou de l'équipe, format paysage conseillé.", max: 1, kinds: ["image"] },
  screenshot: { title: "Capture d'écran (facultatif)", hint: "Une image pour illustrer le problème.", max: 1, kinds: ["image"] },
  story: { title: "Média de la story", hint: `Une photo ou une vidéo de ${LIMITS.storyVideoMaxSeconds} s au plus, format vertical conseillé.`, max: 1, kinds: ["image", "video"] },
};

export function MediaUploader({
  items,
  onChange,
  accept,
}: {
  items: EditorMedia[];
  onChange: (next: EditorMedia[] | ((prev: EditorMedia[]) => EditorMedia[])) => void;
  accept: Accept;
}) {
  const cfg = LABELS[accept];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [altAssist, setAltAssist] = useState(false);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  useEffect(() => {
    altAssistEnabled().then(setAltAssist).catch(() => {});
  }, []);

  const patch = useCallback(
    (id: string, p: Partial<EditorMedia>) => onChange((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m))),
    [onChange],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const room = cfg.max - items.length;
      const errors: string[] = [];
      if (list.length > room) {
        errors.push(room <= 0 ? `Limite atteinte (${cfg.max}).` : `Seuls ${room} fichier(s) supplémentaire(s) sont acceptés.`);
      }
      setRejected(errors);

      for (const file of list.slice(0, Math.max(0, room))) {
        const tempId = `tmp-${crypto.randomUUID()}`;
        const previewUrl = URL.createObjectURL(file);
        const kindGuess: "image" | "video" = /^video\//.test(file.type) || /\.(mp4|mov)$/i.test(file.name) ? "video" : "image";
        if (!cfg.kinds.includes(kindGuess)) {
          setRejected((r) => [...r, `${file.name} : ${kindGuess === "video" ? "vidéo" : "image"} refusée ici (${cfg.title}).`]);
          continue;
        }
        const placeholder: EditorMedia = {
          id: tempId,
          kind: kindGuess,
          variants: {},
          poster_key: null,
          width: null,
          height: null,
          alt: "",
          mime: file.type,
          original_key: "",
          preview_url: previewUrl,
          status: "preparing",
          progress: 0,
        };
        onChange((prev) => [...prev, placeholder]);
        uploadQueue.upsert({ id: tempId, name: file.name, kind: kindGuess, status: "preparing", progress: 0 });

        try {
          const prepared = await prepareFile(file, {
            maxDurationS: accept === "story" ? LIMITS.storyVideoMaxSeconds : LIMITS.postVideoMaxSeconds,
            onProgress: (progress, label) => {
              patch(tempId, { progress, label });
              uploadQueue.upsert({ id: tempId, name: file.name, kind: kindGuess, status: "preparing", progress });
            },
          });
          const fingerprint = await fingerprintFile(prepared.blob);
          if (accept === "story" && prepared.kind === "video" && (prepared.duration ?? 0) > LIMITS.storyVideoMaxSeconds + 0.5) {
            throw new Error(`Une story vidéo dure ${LIMITS.storyVideoMaxSeconds} s au plus (${Math.round(prepared.duration ?? 0)} s).`);
          }
          const created = await createUpload({
            kind: prepared.kind,
            mime: prepared.mime,
            size: prepared.blob.size,
            width: prepared.width,
            height: prepared.height,
            duration: prepared.duration,
            hasPoster: Boolean(prepared.poster),
            fingerprint: fingerprint ?? undefined,
          });
          if (!created.ok) throw new Error(created.error);
          uploadQueue.rename(tempId, created.mediaId);
          const duplicateWarning = created.duplicate ? `Ce fichier semble déjà envoyé${created.duplicate.postTitle ? ` (« ${created.duplicate.postTitle} »)` : ""}. Vous pouvez tout de même continuer.` : undefined;

          const posterPreview = prepared.poster ? URL.createObjectURL(prepared.poster) : undefined;
          onChange((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    id: created.mediaId,
                    original_key: created.key,
                    kind: prepared.kind,
                    mime: prepared.mime,
                    width: prepared.width,
                    height: prepared.height,
                    duration_s: prepared.duration ?? null,
                    poster_preview_url: posterPreview,
                    status: "uploading",
                    warning: duplicateWarning,
                  }
                : m,
            ),
          );

          await uploadFile(
            created.upload,
            prepared.blob,
            (f) => {
              patch(created.mediaId, { progress: f });
              uploadQueue.upsert({ id: created.mediaId, name: file.name, kind: prepared.kind, status: "uploading", progress: f });
            },
            { presignPart: presignMultipartPart, complete: completeMultipart },
            fingerprint,
          );
          if (created.posterUpload && prepared.poster) {
            await uploadWithProgress(created.posterUpload.url, created.posterUpload.headers, prepared.poster, () => {});
          }

          patch(created.mediaId, { status: "processing", progress: 1 });
          uploadQueue.upsert({ id: created.mediaId, name: file.name, kind: prepared.kind, status: "processing", progress: 1 });
          const done = await finalizeMedia(created.mediaId);
          if (!done.ok) throw new Error(done.error);
          uploadQueue.upsert({ id: created.mediaId, name: file.name, kind: prepared.kind, status: "ready", progress: 1 });
          // Vidéo très lourde (4K, 60 i/s) : elle démarre lentement sur mobile
          const perSecond = prepared.kind === "video" && prepared.duration && !prepared.originalBytes ? prepared.blob.size / prepared.duration : 0;
          const warning =
            perSecond > 1.5 * 1024 * 1024
              ? `Vidéo lourde (${Math.round(prepared.blob.size / 1048576)} Mo pour ${Math.round(prepared.duration ?? 0)} s) : elle mettra du temps à démarrer sur mobile. Filmez en 1080p à 30 i/s (Réglages → Appareil photo → Enregistrement vidéo).`
              : undefined;
          onChange((prev) =>
            prev.map((m) =>
              m.id === created.mediaId ? { ...m, ...done.media, preview_url: m.preview_url, poster_preview_url: m.poster_preview_url, status: "ready", progress: 1, warning: warning ?? m.warning } : m,
            ),
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : "Échec de l'envoi.";
          onChange((prev) => prev.map((m) => (m.id === tempId || m.preview_url === previewUrl ? { ...m, status: "error", error: message } : m)));
          uploadQueue.upsert({ id: tempId, name: file.name, kind: kindGuess, status: "error", progress: 0, error: message });
          setTimeout(() => uploadQueue.remove(tempId), 6000);
        }
      }
    },
    [cfg, accept, items.length, onChange, patch],
  );

  function remove(m: EditorMedia) {
    onChange((prev) => prev.filter((x) => x.id !== m.id));
    if (m.preview_url) URL.revokeObjectURL(m.preview_url);
    if (!m.id.startsWith("tmp-")) discardMedia(m.id);
  }

  function move(index: number, dir: -1 | 1) {
    onChange((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  const full = items.length >= cfg.max;

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-text-2">{cfg.title}</p>

      {!full && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[16px] bg-bg-2 px-4 py-8 text-center ring-1 ring-inset",
            dragging ? "ring-glass-edge" : "ring-transparent",
          )}
        >
          <Upload size={22} strokeWidth={1.75} className="text-text-2" aria-hidden="true" />
          <p className="text-[15px] font-medium text-text-1">
            Ajouter {accept === "video" ? "une vidéo" : accept === "cover" || accept === "center_cover" || accept === "screenshot" ? "une image" : accept === "story" ? "une photo ou une vidéo" : "des photos"}
          </p>
          <p className="text-[13px] text-text-3">{cfg.hint}</p>
          <input
            ref={inputRef}
            type="file"
            accept={
              accept === "video"
                ? ".mp4,.mov,video/mp4,video/quicktime"
                : accept === "story"
                  ? ".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,image/*,video/mp4,video/quicktime"
                  : ".jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
            }
            multiple={cfg.max > 1}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {rejected.length > 0 && (
        <ul className="space-y-1 text-[13px] text-red-text" role="alert">
          {rejected.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className={cn("grid gap-3", accept === "images" ? "grid-cols-2 sm:grid-cols-3" : accept === "story" ? "max-w-[220px] grid-cols-1" : "grid-cols-1")}>
          {items.map((m, i) => (
            <li key={m.id} className="overflow-hidden rounded-[16px] bg-bg-2">
              <div className={cn("relative bg-bg-0", accept === "story" ? "aspect-[9/16]" : "aspect-[4/3]")}>
                {m.kind === "video" ? (
                  posterSrc(m) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- aperçu local
                    <img src={posterSrc(m)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video src={m.preview_url} muted playsInline className="h-full w-full object-cover" />
                  )
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local
                  <img src={imageSrc(m, "thumb")} alt="" className="h-full w-full object-cover" />
                )}
                {m.status !== "ready" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-3 text-center text-[13px] font-medium text-white">
                    {m.status === "error" ? (
                      <span className="text-red-text">{m.error}</span>
                    ) : (
                      <>
                        <span>
                          {m.status === "preparing" && (m.label ?? (m.kind === "video" ? "Analyse de la vidéo…" : "Préparation…"))}
                          {m.status === "uploading" && `Envoi ${Math.round(m.progress * 100)} %`}
                          {m.status === "processing" && "Traitement"}
                        </span>
                        <span className="h-1 w-3/4 overflow-hidden rounded-full bg-white/20">
                          <span className="block h-full bg-white transition-[width]" style={{ width: `${Math.round(m.progress * 100)}%` }} />
                        </span>
                      </>
                    )}
                  </div>
                )}
                {m.status === "ready" && m.warning && (
                  <p className="absolute inset-x-2 top-2 rounded-[10px] bg-black/70 px-2.5 py-1.5 text-[11px] leading-snug text-white/90">{m.warning}</p>
                )}
                {m.kind === "video" && m.duration_s != null && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white/90 tabular-nums">
                    {Math.floor(m.duration_s / 60)}:{String(Math.round(m.duration_s % 60)).padStart(2, "0")}
                  </span>
                )}
                {accept === "images" && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white/90 tabular-nums">{i + 1}</span>
                )}
              </div>
              <div className="space-y-2 p-2">
                <input
                  type="text"
                  value={m.alt}
                  onChange={(e) => patch(m.id, { alt: e.target.value })}
                  placeholder="Description pour l'accessibilité"
                  aria-label="Texte alternatif"
                  maxLength={300}
                  className="h-9 w-full rounded-[10px] bg-bg-1 px-3 text-[13px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
                />
                {accept === "images" && (
                  <input
                    type="text"
                    value={m.caption ?? ""}
                    onChange={(e) => patch(m.id, { caption: e.target.value })}
                    placeholder="Légende (facultatif)"
                    aria-label="Légende"
                    maxLength={200}
                    className="h-9 w-full rounded-[10px] bg-bg-1 px-3 text-[13px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
                  />
                )}
                {altAssist && m.kind === "image" && m.status === "ready" && (
                  <button
                    type="button"
                    disabled={suggesting === m.id}
                    onClick={async () => {
                      setSuggesting(m.id);
                      const r = await suggestAlt(m.id);
                      setSuggesting(null);
                      if (r.ok) patch(m.id, { alt: r.alt, alt_source: "assisted" });
                      else setRejected((list) => [...list, r.error]);
                    }}
                    className="mt-1 text-[12px] font-medium text-text-3 hover:text-text-1 disabled:opacity-50"
                  >
                    {suggesting === m.id ? "Proposition en cours…" : m.alt_source === "assisted" ? "Proposer une autre description (à relire)" : "Proposer une description (à relire)"}
                  </button>
                )}
                <div className="flex items-center justify-between">
                  {accept === "images" ? (
                    <span className="flex">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="flex h-8 w-8 items-center justify-center text-text-2 hover:text-text-1 disabled:opacity-30" aria-label="Déplacer avant">
                        <ArrowLeft size={16} strokeWidth={1.75} />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="flex h-8 w-8 items-center justify-center text-text-2 hover:text-text-1 disabled:opacity-30" aria-label="Déplacer après">
                        <ArrowRight size={16} strokeWidth={1.75} />
                      </button>
                    </span>
                  ) : (
                    <span />
                  )}
                  <button type="button" onClick={() => remove(m)} className="flex h-8 items-center gap-1 px-2 text-[13px] font-medium text-text-2 hover:text-text-1" aria-label="Retirer">
                    <X size={16} strokeWidth={1.75} />
                    Retirer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
