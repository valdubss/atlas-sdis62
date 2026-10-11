"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudDownload, CloudOff, FileText, Image as ImageIcon, Search, WifiOff } from "lucide-react";
import type { DocumentItem } from "@/lib/documents/types";
import { formatBytes } from "@/lib/documents/types";
import { readOfflineIds, removeOffline, saveOffline, verifyOffline } from "@/lib/documents/offline";
import { mediaUrl } from "@/lib/media/url";
import { formatDateLong } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Documents utiles : recherche, catégories, ouverture dans le navigateur, et « Garder hors
 * ligne » par document ou par catégorie (fichier copié dans le cache de l'appareil, servi par
 * le service worker sans réseau). Hors ligne, seuls les documents gardés restent ouvrables.
 */
export function DocumentsList({ docs }: { docs: DocumentItem[] }) {
  const [q, setQ] = useState("");
  const [offline, setOffline] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [online, setOnline] = useState(true);
  const toast = useToast();

  useEffect(() => {
    setOffline(readOfflineIds());
    verifyOffline().then(setOffline);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = normalize(q.trim());
    const list = docs.filter((d) => d.published);
    if (!needle) return list;
    return list.filter((d) => normalize(`${d.title} ${d.category} ${d.description ?? ""} ${d.file_name ?? ""}`).includes(needle));
  }, [docs, q]);

  const byCategory = useMemo(() => {
    const map = new Map<string, DocumentItem[]>();
    for (const d of filtered) map.set(d.category, [...(map.get(d.category) ?? []), d]);
    return [...map.entries()];
  }, [filtered]);

  async function toggle(doc: DocumentItem) {
    if (busy.has(doc.id)) return;
    setBusy((b) => new Set(b).add(doc.id));
    try {
      if (offline.has(doc.id)) {
        await removeOffline(doc.id);
        setOffline((s) => {
          const n = new Set(s);
          n.delete(doc.id);
          return n;
        });
      } else {
        const ok = await saveOffline(doc.id, mediaUrl(doc.file_key), doc.kind === "pdf" ? "application/pdf" : "image/jpeg");
        if (!ok) {
          toast("Impossible de garder ce document hors ligne pour le moment.");
          return;
        }
        setOffline((s) => new Set(s).add(doc.id));
      }
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(doc.id);
        return n;
      });
    }
  }

  async function keepCategory(items: DocumentItem[]) {
    const missing = items.filter((d) => !offline.has(d.id));
    if (missing.length === 0) {
      toast("Catégorie déjà disponible hors ligne");
      return;
    }
    let done = 0;
    for (const d of missing) {
      if (await saveOffline(d.id, mediaUrl(d.file_key), d.kind === "pdf" ? "application/pdf" : "image/jpeg")) {
        done++;
        setOffline((s) => new Set(s).add(d.id));
      }
    }
    toast(done === missing.length ? `${done} document${done > 1 ? "s" : ""} gardé${done > 1 ? "s" : ""} hors ligne` : `${done} sur ${missing.length} gardés hors ligne`);
  }

  if (docs.filter((d) => d.published).length === 0) {
    return <EmptyState title="Aucun document pour le moment" description="Les fiches réflexes et documents utiles partagés par le service communication apparaîtront ici." />;
  }

  return (
    <div className="space-y-5">
      <label className="flex h-11 items-center gap-2 rounded-[12px] bg-bg-1 px-3.5 ring-1 ring-transparent focus-within:ring-glass-edge">
        <Search size={18} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un document" aria-label="Rechercher un document" className="min-w-0 flex-1 bg-transparent text-[16px] text-text-1 outline-none placeholder:text-text-3" />
      </label>
      {!online && (
        <p className="flex items-center gap-2 rounded-[12px] bg-bg-1 px-4 py-2.5 text-[13px] text-text-2">
          <WifiOff size={16} strokeWidth={1.75} aria-hidden="true" /> Hors ligne : seuls les documents gardés sur l&apos;appareil s&apos;ouvrent.
        </p>
      )}
      {byCategory.length === 0 && <EmptyState title="Aucun résultat" description="Essayez un autre mot." />}
      {byCategory.map(([category, items]) => (
        <section key={category} className="space-y-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
              {category} <span className="font-normal">· {items.length}</span>
            </h2>
            {online && items.some((d) => !offline.has(d.id)) && (
              <button type="button" onClick={() => keepCategory(items)} className="pressable text-[13px] font-medium text-navy-link">
                Tout garder hors ligne
              </button>
            )}
          </div>
          <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            {items.map((d) => {
              const kept = offline.has(d.id);
              const openable = online || kept;
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <a
                    href={`/documents/f/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!openable}
                    onClick={(e) => !openable && e.preventDefault()}
                    className={cn("flex min-w-0 flex-1 items-center gap-3", !openable && "opacity-50")}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2" aria-hidden="true">
                      {d.kind === "pdf" ? <FileText size={20} strokeWidth={1.75} /> : <ImageIcon size={20} strokeWidth={1.75} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-text-1">{d.title}</span>
                      <span className="block truncate text-[13px] text-text-3">
                        {d.description ? `${d.description} · ` : ""}
                        {formatBytes(d.file_size)} · {formatDateLong(d.updated_at)}
                        {kept && " · hors ligne ✓"}
                      </span>
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={() => toggle(d)}
                    disabled={busy.has(d.id) || (!online && !kept)}
                    aria-pressed={kept}
                    aria-label={kept ? `Ne plus garder « ${d.title} » hors ligne` : `Garder « ${d.title} » hors ligne`}
                    className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors", kept ? "bg-bg-2 text-text-1" : "text-text-3 hover:text-text-1", busy.has(d.id) && "animate-pulse")}
                  >
                    {kept ? <CloudOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <CloudDownload size={18} strokeWidth={1.75} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
