"use client";

import { useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";
import { addLiveEntry } from "@/app/(studio)/studio/direct/actions";
import { MediaUploader, type EditorMedia } from "@/components/studio/MediaUploader";
import { LIVE_LIMITS } from "@/lib/direct/types";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

/** Composeur du service communication : un texte court, une photo facultative, envoi en dix secondes. */
export function LiveComposer({ liveId }: { liveId: string }) {
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<EditorMedia[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const photo = media.find((m) => m.status === "ready" && (m.kind === "image" || m.kind === "video") && !m.id.startsWith("tmp-"));
  const uploading = media.some((m) => m.status !== "ready" && m.status !== "error");
  const canSend = (body.trim().length > 0 || Boolean(photo)) && !uploading && !pending;

  function send() {
    if (!canSend) return;
    haptic();
    start(async () => {
      const r = await addLiveEntry({ live_id: liveId, body: body.trim(), media_id: photo?.id ?? null });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      setBody("");
      setMedia([]);
      toast("Entrée publiée");
    });
  }

  return (
    <section className="space-y-3 rounded-[16px] bg-bg-1 p-4" aria-label="Nouvelle entrée du direct">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={LIVE_LIMITS.entryMax}
        placeholder="Que se passe-t-il ? (600 caractères)"
        aria-label="Texte de l'entrée"
        className="block w-full resize-none rounded-[12px] bg-bg-2 px-3.5 py-3 text-[16px] leading-[1.4] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
      />
      <MediaUploader items={media} onChange={setMedia} accept="live" />
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] text-text-3">{body.length > 0 ? `${LIVE_LIMITS.entryMax - body.length} caractères restants` : "Texte, photo ou clip vidéo."}</span>
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className={cn("pressable inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] px-4 text-[15px] font-semibold", canSend ? "bg-red-fill text-white" : "bg-bg-2 text-text-4")}
        >
          <ArrowUp size={18} strokeWidth={2.25} aria-hidden="true" />
          {uploading ? "Envoi en cours…" : "Publier dans le direct"}
        </button>
      </div>
    </section>
  );
}
