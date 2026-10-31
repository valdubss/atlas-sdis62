"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, ListChecks, Search, Trash2 } from "lucide-react";
import { clearRegistry, deleteRegistryEntry, importRegistry, type RegistryRow } from "@/app/(admin)/admin/agents/actions";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { AGENT_STATUS_LABELS, type AgentStatusValue } from "@/lib/auth/first-access-public";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type Entry = { matricule: string; email: string | null; last_name: string | null; first_name: string | null; center_name: string | null; status: string | null; imported_at: string; linked: boolean };

/**
 * Administration → Agents référencés : liste des matricules autorisés à créer un accès.
 * Même principe que l'import des contacts de centre : collage ou CSV, vérification, application.
 */
export function RegistryAdmin({ rows, shown, total, query, registryMode }: { rows: Entry[]; shown: number; total: number; query: string; registryMode: boolean }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<RegistryRow[] | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  function check() {
    start(async () => {
      const r = await importRegistry(text, false);
      if (!r.ok) return toast(r.error);
      setPreview(r.rows);
      toast(r.rows.length === 0 ? "Aucune ligne lue." : `${r.valid} ligne(s) valide(s) sur ${r.rows.length}`);
    });
  }
  function applyAll() {
    start(async () => {
      const r = await importRegistry(text, true);
      if (!r.ok) return toast(r.error);
      setPreview(null);
      setText("");
      toast(`${r.applied} agent(s) importé(s)`);
      router.refresh();
    });
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
    setPreview(null);
    e.target.value = "";
  }
  function remove(matricule: string) {
    if (!confirm(`Retirer le matricule ${matricule} du référentiel ? L'agent ne pourra plus créer son accès (un compte déjà créé n'est pas touché).`)) return;
    start(async () => {
      const r = await deleteRegistryEntry(matricule);
      toast(r.ok ? "Matricule retiré" : r.error);
      router.refresh();
    });
  }
  function clearAll() {
    if (!confirm(`Vider le référentiel (${total} agent(s)) ? Les comptes existants ne sont pas touchés.`)) return;
    start(async () => {
      const r = await clearRegistry();
      toast(r.ok ? "Référentiel vidé" : r.error);
      router.refresh();
    });
  }

  const valid = preview?.filter((r) => !r.error) ?? [];
  const errors = preview?.filter((r) => r.error).length ?? 0;
  const news = valid.filter((r) => !r.existing).length;

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div className="space-y-1">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Agents référencés</h1>
        <p className="text-[15px] text-text-2">
          {total} matricule{total > 1 ? "s" : ""} autorisé{total > 1 ? "s" : ""} à créer un accès.{" "}
          {registryMode ? (
            "La première connexion par matricule est active."
          ) : (
            <>
              Cette liste ne sert que lorsque la première connexion par matricule est choisie dans les{" "}
              <Link href="/admin/parametres" className="font-medium text-text-1 underline-offset-2 hover:underline">
                paramètres
              </Link>
              .
            </>
          )}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Importer la liste</h2>
        <p className="text-[13px] text-text-3">
          Collez un tableau ou choisissez un fichier CSV, une ligne par agent : <span className="text-text-2">matricule ; nom ; prénom ; e-mail SDIS ; centre ; statut (SPV, SPP, JSP, PATS)</span>. Avec une ligne d&apos;en-têtes, l&apos;ordre des colonnes est libre. Seul le matricule est obligatoire ; nom et prénom, s&apos;ils sont renseignés, doivent être saisis à l&apos;identique par l&apos;agent (accents et casse ignorés). L&apos;e-mail sert d&apos;identifiant de compte s&apos;il existe, sinon ATLAS en forge un à partir du matricule. Un matricule déjà présent est mis à jour.
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          rows={6}
          placeholder={"matricule ; nom ; prénom ; e-mail ; centre ; statut\n12345 ; Dupont ; Marie ; marie.dupont@sdis62.fr ; Lumbres ; SPV\n67890 ; Martin ; Paul ; paul.martin@sdis62.fr ; Calais ; SPP"}
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
          {preview && valid.length > 0 && (
            <Button type="button" size="md" loading={pending} onClick={applyAll}>
              Importer {valid.length} agent{valid.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
        {preview && (
          <div className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            <p className="px-4 py-2.5 text-[13px] text-text-3">
              {preview.length} ligne(s) · {news} nouveau(x) · {valid.length - news} mis à jour · {errors} en erreur
            </p>
            <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
              {preview.slice(0, 300).map((r) => (
                <li key={r.line} className={cn("px-4 py-2.5 text-[13px]", r.error ? "text-red-text" : "text-text-2")}>
                  <span className="font-medium tabular-nums text-text-1">{r.matricule || `ligne ${r.line}`}</span>
                  {r.error ? (
                    <span> · {r.error}</span>
                  ) : (
                    <span>
                      {" "}
                      · {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"} {r.email ? `<${r.email}>` : ""} · {r.center_name ?? "—"} · {r.status ? AGENT_STATUS_LABELS[r.status as AgentStatusValue] : "—"}
                      {r.existing && <span className="text-text-3"> · mise à jour</span>}
                    </span>
                  )}
                </li>
              ))}
              {preview.length > 300 && <li className="px-4 py-2.5 text-[13px] text-text-3">… et {preview.length - 300} autre(s) ligne(s)</li>}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Liste</h2>
          <form action="/admin/agents" className="relative">
            <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" aria-hidden="true" />
            <input name="q" type="search" defaultValue={query} placeholder="Matricule, nom, e-mail" aria-label="Rechercher un agent" className="h-10 w-64 rounded-[10px] bg-bg-2 pl-9 pr-3 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge" />
          </form>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-[16px] bg-bg-1 px-5 py-6 text-center text-[15px] text-text-2">{query ? "Aucun agent ne correspond." : "Aucun agent référencé pour le moment."}</p>
        ) : (
          <div className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            <p className="px-4 py-2.5 text-[13px] text-text-3">
              {shown > rows.length ? `${rows.length} premiers sur ${shown}` : `${shown} agent${shown > 1 ? "s" : ""}`}
              {query ? ` pour « ${query} »` : ""} · <span className="text-text-2">compte créé</span> = matricule déjà rattaché à un compte ATLAS
            </p>
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.matricule} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="text-text-1">
                      <span className="font-semibold tabular-nums">{r.matricule}</span>
                      {(r.first_name || r.last_name) && <span> · {[r.first_name, r.last_name].filter(Boolean).join(" ")}</span>}
                      {r.status && <span className="ml-2 rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-semibold uppercase text-text-2">{AGENT_STATUS_LABELS[r.status as AgentStatusValue] ?? r.status}</span>}
                      {r.linked && <span className="ml-2 rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-medium text-text-2">compte créé</span>}
                    </p>
                    <p className="truncate text-text-3">
                      {[r.email, r.center_name].filter(Boolean).join(" · ") || "—"} · importé {formatDateTime(r.imported_at)}
                    </p>
                  </div>
                  <button type="button" onClick={() => remove(r.matricule)} disabled={pending} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-text-3 hover:bg-bg-2 hover:text-red-text" aria-label={`Retirer ${r.matricule}`}>
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {total > 0 && (
          <Button type="button" variant="danger" size="md" disabled={pending} onClick={clearAll}>
            Vider le référentiel
          </Button>
        )}
      </section>
    </div>
  );
}
