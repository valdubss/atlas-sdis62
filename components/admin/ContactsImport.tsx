"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, ListChecks } from "lucide-react";
import { importCenterContacts, type ImportRow } from "@/app/(admin)/admin/centres/import-actions";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/**
 * Administration → Centres : import en masse des chefs de centre et responsables com.
 * Collage d'un tableau (Excel) ou fichier CSV, vérification ligne par ligne, puis application.
 */
export function ContactsImport() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  function check() {
    start(async () => {
      const r = await importCenterContacts(text, false);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      setRows(r.rows);
      toast(r.rows.length === 0 ? "Aucune ligne lue." : `${r.matched} centre(s) reconnu(s) sur ${r.rows.length} ligne(s)`);
    });
  }

  function applyAll() {
    start(async () => {
      const r = await importCenterContacts(text, true);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      setRows(r.rows);
      toast(`${r.applied} centre(s) mis à jour`);
      router.refresh();
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
    setRows(null);
    e.target.value = "";
  }

  const changes = rows?.filter((r) => r.center && !r.error && r.changed).length ?? 0;
  const errors = rows?.filter((r) => r.error).length ?? 0;

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Chefs de centre et responsables com</h2>
      <p className="text-[13px] text-text-3">
        Collez un tableau, une ligne par centre : <span className="text-text-2">centre ; chef de centre ; e-mail du chef ; responsable com ; e-mail du responsable com</span>. Les noms sont facultatifs, une cellule vide laisse la valeur actuelle, « - » l&apos;efface. L&apos;agent dont l&apos;adresse correspond est rattaché d&apos;office à son centre dès sa connexion.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setRows(null);
        }}
        rows={6}
        placeholder={"Lumbres ; Capitaine Dupont ; prenom.nom@sdis62.fr ; Sergent Martin ; prenom.nom@sdis62.fr\nCalais ; ; chef.calais@sdis62.fr ; ; com.calais@sdis62.fr"}
        aria-label="Lignes à importer"
        className="block w-full rounded-[12px] bg-bg-2 px-3.5 py-3 font-mono text-[13px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
      />
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} />
        <Button type="button" variant="secondary" size="md" onClick={() => fileRef.current?.click()}>
          <FileUp size={16} strokeWidth={1.75} aria-hidden="true" /> Fichier CSV
        </Button>
        <Button type="button" variant="secondary" size="md" loading={pending} disabled={!text.trim()} onClick={check}>
          <ListChecks size={16} strokeWidth={1.75} aria-hidden="true" /> Vérifier
        </Button>
        {rows && changes > 0 && (
          <Button type="button" size="md" loading={pending} onClick={applyAll}>
            Appliquer {changes} modification{changes > 1 ? "s" : ""}
          </Button>
        )}
      </div>
      {rows && (
        <div className="hairline overflow-hidden rounded-[16px] bg-bg-1">
          <p className="px-4 py-2.5 text-[13px] text-text-3">
            {rows.length} ligne(s) · {changes} à modifier · {rows.filter((r) => r.center && !r.error && !r.changed).length} déjà à jour · {errors} en erreur
          </p>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.line} className={cn("px-4 py-2.5 text-[13px]", r.error ? "text-red-text" : "text-text-2")}>
                <span className="font-medium text-text-1">{r.center?.name ?? (r.input || `ligne ${r.line}`)}</span>
                {r.error ? (
                  <span> · {r.error}</span>
                ) : (
                  <span className="block truncate sm:inline">
                    {" "}
                    · chef : {r.chief_name || "—"} {r.chief_email ? `<${r.chief_email}>` : ""} · com : {r.com_name || "—"} {r.com_email ? `<${r.com_email}>` : ""}
                    {!r.changed && <span className="text-text-3"> · inchangé</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
