"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, X } from "lucide-react";
import { publishNote, signNoteUpload } from "@/app/(app)/centre/notes-actions";
import { NOTE_LIMITS } from "@/lib/centres/notes";
import { prepareFile, uploadWithProgress } from "@/lib/media/client";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField, CheckboxField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type Upload = {
  name: string;
  size: number;
  kind: "pdf" | "image";
  preview: string | null;
  progress: number;
  key: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
}

/**
 * Feuille « Publier une note » : un PDF ou une image (envoyé directement au
 * stockage, image réduite sur l'appareil), un titre, un texte facultatif,
 * épinglage. Visible aussitôt par les membres du centre, qui sont prévenus.
 */
export function NoteComposer({ centerId, centerName, open, onClose }: { centerId: string; centerName: string; open: boolean; onClose: () => void }) {
  const [upload, setUpload] = useState<Upload | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  function reset() {
    setUpload(null);
    setTitle("");
    setBody("");
    setPinned(false);
  }

  async function pick(file: File) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const base = file.name.replace(/\.[a-z0-9]{2,5}$/i, "");
    if (!title) setTitle(base.slice(0, NOTE_LIMITS.titleMax));
    const draft: Upload = { name: file.name, size: file.size, kind: isPdf ? "pdf" : "image", preview: null, progress: 0, key: null, width: null, height: null, error: null };
    setUpload(draft);
    try {
      let blob: Blob = file;
      let mime = isPdf ? "application/pdf" : file.type;
      let width: number | null = null;
      let height: number | null = null;
      if (!isPdf) {
        const prepared = await prepareFile(file);
        if (prepared.kind !== "image") throw new Error("Image attendue (JPG ou PNG).");
        blob = prepared.blob;
        mime = prepared.mime;
        width = prepared.width;
        height = prepared.height;
        setUpload((u) => (u ? { ...u, preview: URL.createObjectURL(blob), size: blob.size } : u));
      } else if (file.size > NOTE_LIMITS.pdfMaxBytes) throw new Error("PDF de 25 Mo au plus.");
      const signed = await signNoteUpload({ center_id: centerId, mime, size: blob.size, name: file.name });
      if (!signed.ok) throw new Error(signed.error);
      await uploadWithProgress(signed.url, signed.headers, blob, (f) => setUpload((u) => (u ? { ...u, progress: f } : u)));
      setUpload((u) => (u ? { ...u, progress: 1, key: signed.key, kind: signed.kind, width, height, size: blob.size } : u));
    } catch (e) {
      setUpload((u) => (u ? { ...u, error: e instanceof Error ? e.message : "Envoi impossible" } : u));
    }
  }

  function submit() {
    if (!upload?.key) return;
    start(async () => {
      const r = await publishNote({ center_id: centerId, title, body, kind: upload.kind, file_key: upload.key, file_name: upload.name, file_size: upload.size, width: upload.width, height: upload.height, pinned });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      toast("Note publiée : les membres du centre sont prévenus");
      reset();
      onClose();
      router.refresh();
    });
  }

  const uploading = Boolean(upload && !upload.key && !upload.error);

  return (
    <Sheet open={open} onClose={onClose} title="Publier une note" tall>
      <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <p className="text-[13px] text-text-3">Visible par les membres de {centerName} et le service communication. Ni réactions ni commentaires.</p>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          className="sr-only"
          aria-label="Document de la note"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = "";
          }}
        />

        {!upload ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => fileInput.current && ((fileInput.current.accept = "application/pdf"), fileInput.current.click())} className="pressable flex h-28 flex-col items-center justify-center gap-2 rounded-[16px] bg-bg-1 text-text-1">
              <FileText size={26} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[14px] font-medium">Document PDF</span>
            </button>
            <button type="button" onClick={() => fileInput.current && ((fileInput.current.accept = "image/*"), fileInput.current.click())} className="pressable flex h-28 flex-col items-center justify-center gap-2 rounded-[16px] bg-bg-1 text-text-1">
              <ImagePlus size={26} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[14px] font-medium">Image</span>
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[16px] bg-bg-1">
            {upload.preview && (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local
              <img src={upload.preview} alt="" className="max-h-56 w-full object-cover" />
            )}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]", upload.kind === "pdf" ? "bg-red-soft text-red-text" : "bg-bg-2 text-text-2")}>
                {upload.kind === "pdf" ? <FileText size={20} strokeWidth={1.75} aria-hidden="true" /> : <ImagePlus size={20} strokeWidth={1.75} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-text-1">{upload.name}</span>
                <span className="block text-[13px] text-text-3">
                  {upload.error ? <span className="text-red-text">{upload.error}</span> : upload.key ? `${upload.kind === "pdf" ? "PDF" : "Image"} · ${formatSize(upload.size)}` : `Envoi… ${Math.round(upload.progress * 100)} %`}
                </span>
              </span>
              <button type="button" onClick={() => setUpload(null)} aria-label="Retirer le document" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-3 hover:text-text-1">
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            {uploading && (
              <div className="h-1 w-full bg-bg-2" role="progressbar" aria-valuenow={Math.round(upload.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-red-fill transition-[width]" style={{ width: `${Math.round(upload.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        <Field label="Titre" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={NOTE_LIMITS.titleMax} required placeholder="Note de service n° 12 — astreintes de novembre" />
        <TextareaField label="Texte (facultatif)" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={NOTE_LIMITS.bodyMax} placeholder="Un mot d'accompagnement, les points à retenir." />
        <CheckboxField label="Épingler en tête de liste" name="pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />

        <Button type="button" onClick={submit} loading={pending} disabled={!upload?.key || !title.trim()} className="w-full">
          {uploading ? "Envoi du document…" : "Publier la note"}
        </Button>
      </div>
    </Sheet>
  );
}
