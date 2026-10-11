"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Plus } from "lucide-react";
import { deleteDocument, saveDocument, signDocumentUpload } from "@/app/(admin)/admin/documents/actions";
import { uploadWithProgress } from "@/lib/media/client";
import { DOC_DEFAULT_CATEGORY, DOC_LIMITS, formatBytes, type DocumentItem } from "@/lib/documents/types";
import { formatDateLong } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field, TextareaField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { cn } from "@/lib/cn";

type Draft = { id?: string; title: string; category: string; description: string; published: boolean; sort_order: number };
const EMPTY: Draft = { title: "", category: DOC_DEFAULT_CATEGORY, description: "", published: true, sort_order: 0 };

/**
 * Administration → Documents : liste par catégorie, fiche en feuille (titre, catégorie,
 * description, visibilité, ordre, fichier PDF ou image envoyé directement au stockage).
 */
export function DocumentsAdmin({ docs }: { docs: DocumentItem[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const categories = useMemo(() => [...new Set(docs.map((d) => d.category))].sort((a, b) => a.localeCompare(b, "fr")), [docs]);
  const byCategory = useMemo(() => {
    const map = new Map<string, DocumentItem[]>();
    for (const d of docs) map.set(d.category, [...(map.get(d.category) ?? []), d]);
    return [...map.entries()];
  }, [docs]);

  function edit(d?: DocumentItem) {
    setDraft(d ? { id: d.id, title: d.title, category: d.category, description: d.description ?? "", published: d.published, sort_order: d.sort_order } : EMPTY);
    setFile(null);
    setProgress(null);
    setOpen(true);
  }

  function save() {
    start(async () => {
      let fileFields: { kind: "pdf" | "image"; file_key: string; file_name: string; file_size: number } | null = null;
      if (file) {
        const signed = await signDocumentUpload({ mime: file.type, size: file.size, name: file.name });
        if (!signed.ok) {
          toast(signed.error);
          return;
        }
        try {
          setProgress(0);
          await uploadWithProgress(signed.url, signed.headers, file, (f) => setProgress(f));
        } catch (e) {
          toast(e instanceof Error ? e.message : "Envoi interrompu.");
          setProgress(null);
          return;
        }
        fileFields = { kind: signed.kind, file_key: signed.key, file_name: file.name, file_size: file.size };
      } else if (!draft.id) {
        toast("Ajoutez un fichier (PDF ou image).");
        return;
      }
      const r = await saveDocument({ ...draft, ...(fileFields ?? {}) });
      setProgress(null);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      toast(draft.id ? "Document mis à jour" : "Document ajouté");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(d: DocumentItem) {
    confirm({ title: `Retirer « ${d.title} » ?`, message: "Le document disparaît de la liste et son fichier est supprimé.", confirmLabel: "Retirer", danger: true }).then((ok) => {
      if (!ok) return;
      start(async () => {
        const r = await deleteDocument(d.id);
        toast(r.ok ? "Document retiré" : r.error);
        if (r.ok) router.refresh();
      });
    });
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Documents</h1>
          <p className="text-[13px] text-text-3">Fiches réflexes, procédures, formulaires : visibles de tous les agents dans Profil → Documents, et gardés hors ligne à leur demande.</p>
        </div>
        <Button type="button" size="md" onClick={() => edit()}>
          <Plus size={16} strokeWidth={2} aria-hidden="true" /> Ajouter un document
        </Button>
      </div>

      {docs.length === 0 && <p className="hairline rounded-[16px] bg-bg-1 px-5 py-4 text-[15px] text-text-2">Aucun document pour le moment.</p>}
      {byCategory.map(([category, items]) => (
        <section key={category} className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
            {category} <span className="font-normal">· {items.length}</span>
          </h2>
          <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2" aria-hidden="true">
                  {d.kind === "pdf" ? <FileText size={20} strokeWidth={1.75} /> : <ImageIcon size={20} strokeWidth={1.75} />}
                </span>
                <button type="button" onClick={() => edit(d)} className="min-w-0 flex-1 text-left">
                  <span className={cn("block truncate text-[15px] font-medium", d.published ? "text-text-1" : "text-text-3")}>
                    {d.title}
                    {!d.published && " · brouillon"}
                  </span>
                  <span className="block truncate text-[13px] text-text-3">
                    {d.file_name ?? d.kind} · {formatBytes(d.file_size)} · {formatDateLong(d.updated_at)}
                  </span>
                </button>
                <a href={`/documents/f/${d.id}`} target="_blank" rel="noreferrer" className="pressable shrink-0 text-[13px] font-medium text-navy-link">
                  Ouvrir
                </a>
                <button type="button" onClick={() => remove(d)} className="pressable shrink-0 text-[13px] font-medium text-text-3 hover:text-red-text">
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={open} onClose={() => !pending && setOpen(false)} title={draft.id ? "Modifier le document" : "Nouveau document"}>
        <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          <Field label="Titre" name="title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={DOC_LIMITS.titleMax} placeholder="Fiche réflexe feu de véhicule" />
          <Field label="Catégorie" name="category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} maxLength={DOC_LIMITS.categoryMax} list="doc-categories" placeholder="Fiches réflexes" />
          <datalist id="doc-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <TextareaField label="Description (facultative)" name="description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={DOC_LIMITS.descriptionMax} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ordre dans la catégorie" name="sort_order" type="number" inputMode="numeric" value={String(draft.sort_order)} onChange={(e) => setDraft({ ...draft, sort_order: Math.max(0, Number(e.target.value) || 0) })} />
            <div className="pt-6">
              <CheckboxField label="Visible des agents" name="published" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
            </div>
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="secondary" size="md" onClick={() => fileRef.current?.click()}>
              {file ? `${file.name} (${formatBytes(file.size)})` : draft.id ? "Remplacer le fichier" : "Choisir le fichier (PDF ou image)"}
            </Button>
            {progress !== null && (
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-text-1 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            <p className="text-[13px] text-text-3">PDF jusqu&apos;à 40 Mo, image jusqu&apos;à 12 Mo.</p>
          </div>
          <Button type="button" size="md" loading={pending} onClick={save}>
            {draft.id ? "Enregistrer" : "Ajouter"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
