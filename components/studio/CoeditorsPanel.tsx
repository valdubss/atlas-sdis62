"use client";

import { useEffect, useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { addCoeditor, listCoeditors, removeCoeditor, searchCoeditorCandidates, type Coeditor } from "@/app/(studio)/studio/posts/actions";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { ROLE_LABELS } from "@/lib/config";
import { cn } from "@/lib/cn";

/**
 * Co-rédacteurs d'une publication (éditeurs) : tout membre du service
 * communication modifie déjà toute publication ; ici on ajoute un agent
 * extérieur au service, qui pourra modifier le contenu sans publier.
 */
export function CoeditorsPanel({ postId }: { postId: string }) {
  const [list, setList] = useState<Coeditor[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Coeditor[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    listCoeditors(postId).then(setList).catch(() => {});
  }, [postId]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => searchCoeditorCandidates(q).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  function add(p: Coeditor) {
    start(async () => {
      const r = await addCoeditor(postId, p.id);
      if (!r.ok) return toast(r.error);
      setList((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
      setQ("");
      setResults([]);
      toast(`${p.first_name} ${p.last_name} ajouté : il peut modifier le texte et les médias`);
    });
  }

  function remove(p: Coeditor) {
    start(async () => {
      const r = await removeCoeditor(postId, p.id);
      if (!r.ok) return toast(r.error);
      setList((prev) => prev.filter((x) => x.id !== p.id));
    });
  }

  const candidates = results.filter((r) => !list.some((x) => x.id === r.id));

  return (
    <section className="space-y-3 rounded-[16px] bg-bg-1 p-5">
      <div>
        <h2 className="text-[15px] font-semibold text-text-1">Co-rédacteurs</h2>
        <p className="text-[13px] text-text-3">Le service communication modifie déjà toute publication. Ajoutez un agent extérieur : il pourra modifier le texte et les médias, sans publier ni supprimer.</p>
      </div>
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-text-1">
                  {p.first_name} {p.last_name}
                </span>
                <span className="block truncate text-[13px] text-text-3">
                  {p.email} · {ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] ?? p.role}
                </span>
              </span>
              <button type="button" onClick={() => remove(p)} disabled={pending} aria-label={`Retirer ${p.first_name} ${p.last_name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-text-3 hover:text-red-text disabled:opacity-40">
                <X size={16} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <label className="flex items-center gap-2 rounded-[10px] bg-bg-2 px-3">
          <UserPlus size={16} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un agent (nom ou adresse)" aria-label="Rechercher un agent à ajouter" autoComplete="off" className="h-10 w-full bg-transparent text-[15px] text-text-1 outline-none placeholder:text-text-3" />
        </label>
        {candidates.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[12px] bg-bg-2 shadow-[var(--shadow-float)]">
            {candidates.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} disabled={pending} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-1", pending && "opacity-60")}>
                  <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">
                      {p.first_name} {p.last_name}
                    </span>
                    <span className="block truncate text-[13px] text-text-3">{p.email}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
