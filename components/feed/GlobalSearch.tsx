"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Building, Clock, FileText, Search, User, X } from "lucide-react";
import { searchAll, type SearchAllResult } from "@/app/(app)/feed-actions";
import { searchHistory } from "@/lib/feed/reading";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelative } from "@/lib/format";
import { CENTER_TYPE_LABELS } from "@/lib/config";

const TYPE: Record<string, string> = { photo: "Photos", video: "Vidéo", text: "Annonce", article: "Article", poll: "Sondage" };

/**
 * Recherche globale (loupe du fil) : un champ, résultats groupés (publications,
 * centres, services, personnes visibles), tolérance aux fautes, historique
 * local des 5 dernières recherches.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchAllResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setHistory(searchHistory.read());
    const t = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [open]);

  const query = q.trim();
  useEffect(() => {
    if (query.length < 2) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => start(async () => setResult(await searchAll(query))), 180);
    return () => clearTimeout(t);
  }, [query]);

  function commit(text: string) {
    setHistory(searchHistory.push(text));
  }

  const empty = result && result.posts.length + result.centers.length + result.services.length + result.people.length === 0;

  return (
    <Sheet open={open} onClose={onClose} title="Rechercher" tall>
      <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <label className="relative block">
          <Search size={18} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit(q)}
            placeholder="Publication, centre, service, agent"
            aria-label="Rechercher dans ATLAS"
            autoComplete="off"
            enterKeyHint="search"
            className="block h-11 w-full rounded-[12px] bg-bg-2 pl-10 pr-10 text-[15px] text-text-1 outline-none ring-1 ring-transparent placeholder:text-text-3 focus:ring-glass-edge"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Effacer" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-text-3 hover:text-text-1">
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </label>

        {query.length < 2 && history.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Récentes</h3>
              <button type="button" onClick={() => { searchHistory.clear(); setHistory([]); }} className="text-[13px] text-text-3 hover:text-text-1">
                Effacer
              </button>
            </div>
            <ul>
              {history.map((h) => (
                <li key={h}>
                  <button type="button" onClick={() => setQ(h)} className="pressable flex h-11 w-full items-center gap-3 rounded-[10px] px-2 text-left text-[15px] text-text-1 hover:bg-bg-2">
                    <Clock size={16} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
                    {h}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pending && !result && <p className="px-1 text-[13px] text-text-3">Recherche…</p>}
        {empty && <p className="px-1 py-6 text-center text-[15px] text-text-2">Aucun résultat pour « {query} ».</p>}

        {result && result.posts.length > 0 && (
          <Group title="Publications">
            {result.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/post/${p.slug}`} onClick={() => { commit(query); onClose(); }} className="pressable flex items-start gap-3 px-3 py-2.5">
                  <FileText size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">{p.title ?? p.excerpt ?? "Publication"}</span>
                    <span className="block truncate text-[13px] text-text-3">
                      {TYPE[p.type] ?? p.type} · {formatRelative(p.published_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </Group>
        )}
        {result && result.centers.length > 0 && (
          <Group title="Centres">
            {result.centers.map((c) => (
              <li key={c.id}>
                <Link href={`/centre/${c.slug}`} onClick={() => { commit(query); onClose(); }} className="pressable flex items-center gap-3 px-3 py-2.5">
                  <Building size={18} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">{c.name}</span>
                    <span className="block truncate text-[13px] text-text-3">{[CENTER_TYPE_LABELS[c.type as keyof typeof CENTER_TYPE_LABELS] ?? c.type, c.city].filter(Boolean).join(" · ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </Group>
        )}
        {result && result.services.length > 0 && (
          <Group title="Services">
            {result.services.map((s) => (
              <li key={s.id}>
                <Link href={`/service/${s.slug}`} onClick={() => { commit(query); onClose(); }} className="pressable flex items-center gap-3 px-3 py-2.5">
                  <Building size={18} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">{s.name}</span>
                    {s.short_description && <span className="block truncate text-[13px] text-text-3">{s.short_description}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </Group>
        )}
        {result && result.people.length > 0 && (
          <Group title="Personnes">
            {result.people.map((p) => (
              <li key={p.id}>
                <Link href={p.center ? `/centre/${p.center.slug}` : p.service ? `/service/${p.service.slug}` : "/annuaire"} onClick={() => { commit(query); onClose(); }} className="pressable flex items-center gap-3 px-3 py-2.5">
                  <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">
                      {p.first_name} {p.last_name}
                    </span>
                    <span className="block truncate text-[13px] text-text-3">{[p.job_title, p.center?.name ?? p.service?.name].filter(Boolean).join(" · ") || "Agent"}</span>
                  </span>
                  <User size={16} strokeWidth={1.75} className="text-text-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </Group>
        )}
      </div>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{title}</h3>
      <ul className="hairline rounded-[12px] bg-bg-2/60">{children}</ul>
    </section>
  );
}
