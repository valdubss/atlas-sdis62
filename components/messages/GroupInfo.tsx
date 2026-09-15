"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Download, FileText, Image as ImageIcon, LogOut, Search, UserPlus, X } from "lucide-react";
import type { ChannelInfo, DirectoryPerson, Message } from "@/lib/messages/types";
import { endsIn, groupDirectory, MESSAGE_LIMITS } from "@/lib/messages/helpers";
import { addMembers, archiveGroup, exportChannel, fetchMessages, leaveGroup, messagingDirectory, removeMember, searchChannel, setChannelPrefs, updateGroup } from "@/app/(app)/messages/actions";
import { mediaUrl } from "@/lib/media/url";
import { formatDateTime, toDatetimeLocal } from "@/lib/format";
import { AvatarMosaic } from "./AvatarMosaic";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/**
 * Fiche d'une conversation : photo, nom, objet, compte à rebours ; actions
 * Notifications / Rechercher / Médias ; membres (ajouter, retirer, quitter) ;
 * Modifier / Archiver / Exporter (éditeurs) ; bandeau charte.
 */
export function GroupInfo({ info, me, isEditor }: { info: ChannelInfo; me: string; isEditor: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<null | "notifications" | "search" | "media" | "add" | "edit">(null);
  const isGroup = info.type === "group";
  const myRole = info.me?.role ?? (isEditor ? "admin" : "member");
  const canManage = isEditor || myRole === "admin";
  const countdown = endsIn(info.ends_at);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string, then?: () => void) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Erreur");
      else {
        toast(done);
        then?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <AvatarMosaic photoKey={info.photo_key} people={info.members.slice(0, 4).map((m) => ({ name: `${m.first_name} ${m.last_name}`, avatar_key: m.avatar_key }))} size={88} />
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">{info.name}</h1>
          {info.subject && <p className="mt-0.5 text-[15px] text-text-2">{info.subject}</p>}
          <p className="mt-1 text-[13px] text-text-3">
            {info.members.length} membre{info.members.length > 1 ? "s" : ""}
            {countdown && ` · fin dans ${countdown}`}
            {info.archived_at && " · archivé"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "notifications" as const, icon: Bell, label: "Notifications" },
          { key: "search" as const, icon: Search, label: "Rechercher" },
          { key: "media" as const, icon: ImageIcon, label: `Médias${info.media_count ? ` (${info.media_count})` : ""}` },
        ].map((a) => (
          <button key={a.key} type="button" onClick={() => setSheet(a.key)} className="pressable flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-[16px] bg-bg-1 text-[12px] font-medium text-text-1">
            <a.icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {a.label}
          </button>
        ))}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Membres</h2>
          {isGroup && canManage && !info.archived_at && (
            <button type="button" onClick={() => setSheet("add")} className="flex items-center gap-1.5 text-[13px] font-medium text-text-2 hover:text-text-1">
              <UserPlus size={16} strokeWidth={1.75} /> Ajouter
            </button>
          )}
        </div>
        <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
          {info.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={`${m.first_name} ${m.last_name}`} avatarKey={m.avatar_key} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-text-1">
                  {m.first_name} {m.last_name}
                  {m.id === me && <span className="text-text-3"> (vous)</span>}
                </span>
                <span className="block truncate text-[13px] text-text-3">{[m.job_title, m.center].filter(Boolean).join(" · ")}</span>
              </span>
              {m.role === "admin" && <span className="rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-medium text-text-2">Admin</span>}
              {isGroup && canManage && m.id !== me && !info.archived_at && (
                <button type="button" disabled={pending} onClick={() => window.confirm(`Retirer ${m.first_name} du groupe ?`) && run(() => removeMember(info.id, m.id), "Membre retiré")} aria-label={`Retirer ${m.first_name}`} className="flex h-8 w-8 items-center justify-center text-text-3 hover:text-text-1">
                  <X size={16} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isGroup && (
        <section className="hairline overflow-hidden rounded-[16px] bg-bg-1">
          {canManage && !info.archived_at && (
            <button type="button" onClick={() => setSheet("edit")} className="pressable flex h-12 w-full items-center px-4 text-left text-[15px] text-text-1">
              Modifier le groupe
            </button>
          )}
          {isEditor && (
            <button type="button" disabled={pending} onClick={() => window.confirm(info.archived_at ? "Réactiver ce groupe ?" : "Archiver ce groupe ? Il passera en lecture seule.") && run(() => archiveGroup(info.id, !info.archived_at), info.archived_at ? "Groupe réactivé" : "Groupe archivé")} className="pressable flex h-12 w-full items-center px-4 text-left text-[15px] text-text-1">
              {info.archived_at ? "Réactiver le groupe" : "Archiver le groupe"}
            </button>
          )}
          {isEditor && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await exportChannel(info.id);
                  if (!r.ok) return toast(r.error);
                  const blob = new Blob([r.text], { type: "text/plain;charset=utf-8" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `${info.name.replace(/[^\w-]+/g, "_")}.txt`;
                  a.click();
                })
              }
              className="pressable flex h-12 w-full items-center gap-2 px-4 text-left text-[15px] text-text-1"
            >
              <Download size={18} strokeWidth={1.75} /> Exporter la conversation (texte)
            </button>
          )}
          {!isEditor && myRole !== "admin" && !info.archived_at && (
            <button type="button" disabled={pending} onClick={() => window.confirm("Quitter ce groupe ?") && run(() => leaveGroup(info.id), "Vous avez quitté le groupe", () => router.replace("/messages"))} className="pressable flex h-12 w-full items-center gap-2 px-4 text-left text-[15px] text-red-text">
              <LogOut size={18} strokeWidth={1.75} /> Quitter le groupe
            </button>
          )}
        </section>
      )}

      <p className="rounded-[16px] bg-bg-1 px-4 py-3 text-[13px] leading-[1.45] text-text-3">
        Messagerie de travail du SDIS 62 : usage professionnel, respect de la charte. Les messages sont conservés 24 mois puis effacés ; ils ne sont pas chiffrés de bout en bout et restent accessibles au service communication dans le cadre de la modération. Voir <Link href="/a-propos" className="text-text-2 underline">À propos</Link>.
      </p>

      <NotificationsSheet open={sheet === "notifications"} onClose={() => setSheet(null)} info={info} />
      <SearchSheet open={sheet === "search"} onClose={() => setSheet(null)} channelId={info.id} />
      <MediaSheet open={sheet === "media"} onClose={() => setSheet(null)} channelId={info.id} isEditor={isEditor} />
      {isGroup && <AddMembersSheet open={sheet === "add"} onClose={() => setSheet(null)} info={info} onDone={() => router.refresh()} />}
      {isGroup && <EditSheet open={sheet === "edit"} onClose={() => setSheet(null)} info={info} onDone={() => router.refresh()} />}
    </div>
  );
}

function NotificationsSheet({ open, onClose, info }: { open: boolean; onClose: () => void; info: ChannelInfo }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const current = info.me?.notifications ?? "all";
  const muted = Boolean(info.me?.muted_until && new Date(info.me.muted_until).getTime() > Date.now());
  const set = (prefs: Parameters<typeof setChannelPrefs>[1], msg: string) =>
    start(async () => {
      const r = await setChannelPrefs(info.id, prefs);
      toast(r.ok ? msg : r.error);
      if (r.ok) onClose();
    });
  return (
    <Sheet open={open} onClose={onClose} title="Notifications">
      <ul className="hairline mx-3 mb-[max(env(safe-area-inset-bottom),16px)] overflow-hidden rounded-[16px] bg-bg-1">
        {[
          ["all", "Tous les messages"],
          ["mentions", "Mentions seulement"],
          ["none", "Aucune"],
        ].map(([v, label]) => (
          <li key={v}>
            <button type="button" disabled={pending} onClick={() => set({ notifications: v as "all" | "mentions" | "none" }, "Préférence enregistrée")} className={cn("pressable flex h-12 w-full items-center justify-between px-4 text-left text-[15px]", current === v ? "text-text-1" : "text-text-2")}>
              {label}
              {current === v && <span className="text-[13px] text-text-3">Actuel</span>}
            </button>
          </li>
        ))}
        <li>
          <button type="button" disabled={pending} onClick={() => set({ mute_hours: muted ? 0 : 8 }, muted ? "Silence levé" : "En silence pour 8 h")} className="pressable flex h-12 w-full items-center px-4 text-left text-[15px] text-text-1">
            {muted ? "Lever le silence" : "Silence pendant 8 h"}
          </button>
        </li>
        <li>
          <button type="button" disabled={pending} onClick={() => set({ pinned: !info.me?.pinned }, info.me?.pinned ? "Conversation désépinglée" : "Conversation épinglée")} className="pressable flex h-12 w-full items-center px-4 text-left text-[15px] text-text-1">
            {info.me?.pinned ? "Désépingler la conversation" : "Épingler la conversation"}
          </button>
        </li>
      </ul>
    </Sheet>
  );
}

function SearchSheet({ open, onClose, channelId }: { open: boolean; onClose: () => void; channelId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => searchChannel(channelId, q).then(setResults), 200);
    return () => clearTimeout(t);
  }, [q, channelId]);
  return (
    <Sheet open={open} onClose={onClose} title="Rechercher" tall>
      <div className="space-y-3 px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Un mot, un nom…" aria-label="Rechercher dans la conversation" autoFocus className="h-11 w-full rounded-[12px] bg-bg-1 px-3 text-[16px] text-text-1 outline-none placeholder:text-text-3" />
        <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
          {q.trim().length >= 2 && results.length === 0 && <li className="px-4 py-6 text-center text-[15px] text-text-2">Aucun message.</li>}
          {results.map((m) => (
            <li key={m.id}>
              <Link href={`/messages/${channelId}#msg-${m.id}`} onClick={onClose} className="pressable block px-4 py-2.5">
                <span className="block text-[12px] text-text-3">
                  {m.author ? `${m.author.first_name} ${m.author.last_name}` : "Agent"} · {formatDateTime(m.created_at)}
                </span>
                <span className="block text-[15px] text-text-1">{m.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function MediaSheet({ open, onClose, channelId, isEditor }: { open: boolean; onClose: () => void; channelId: string; isEditor: boolean }) {
  const [tab, setTab] = useState<"media" | "files" | "links">("media");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    (async () => {
      const all: Message[] = [];
      let before: string | null = null;
      for (let i = 0; i < 5; i++) {
        const page = await fetchMessages(channelId, before);
        all.unshift(...page);
        if (page.length < 40) break;
        before = page[0].created_at;
      }
      setMessages(all.filter((m) => !m.deleted_at));
    })();
  }, [open, channelId]);
  const items = useMemo(() => {
    const media = messages.flatMap((m) => (m.media ?? []).map((x, i) => ({ m, x, i })));
    return {
      media: media.filter(({ x }) => x.kind !== "file").reverse(),
      files: media.filter(({ x }) => x.kind === "file").reverse(),
      links: messages.flatMap((m) => (m.body?.match(/https?:\/\/\S+/g) ?? []).map((u) => ({ m, u }))).reverse(),
    };
  }, [messages]);
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <Sheet open={open} onClose={onClose} title="Médias, fichiers, liens" tall>
      <div className="space-y-3 px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="flex gap-1.5" role="tablist">
          {(["media", "files", "links"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-9 rounded-full px-4 text-[13px] font-medium", tab === t ? "bg-bg-2 text-text-1" : "bg-bg-1 text-text-2")}>
              {t === "media" ? `Médias ${items.media.length}` : t === "files" ? `Fichiers ${items.files.length}` : `Liens ${items.links.length}`}
            </button>
          ))}
        </div>
        {tab === "media" && (
          <>
            <div className="grid grid-cols-3 gap-1">
              {items.media.map(({ m, x }) => {
                const key = `${m.id}:${x.key}`;
                const on = selected.has(key);
                return (
                  <button key={key} type="button" onClick={() => toggle(key)} aria-pressed={on} className={cn("relative aspect-square overflow-hidden rounded-[8px] bg-bg-1", on && "ring-2 ring-text-1")}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- vignette */}
                    <img src={mediaUrl(x.kind === "video" ? (x.poster_key ?? x.key) : x.key)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
            {items.media.length === 0 && <p className="py-6 text-center text-[15px] text-text-2">Aucun média.</p>}
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    for (const key of selected) {
                      const k = key.split(":").slice(1).join(":");
                      const a = document.createElement("a");
                      a.href = mediaUrl(k);
                      a.download = k.split("/").pop() ?? "media";
                      a.target = "_blank";
                      a.rel = "noreferrer";
                      a.click();
                    }
                  }}
                >
                  Télécharger ({selected.size})
                </Button>
                {isEditor && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const { importMessageMedia } = await import("@/app/(app)/messages/media-actions");
                      let done = 0;
                      for (const key of selected) {
                        const [mid] = key.split(":");
                        const entry = items.media.find((e) => `${e.m.id}:${e.x.key}` === key);
                        if (!entry || entry.x.kind !== "image") continue;
                        const r = await importMessageMedia(mid, entry.i);
                        if (r.ok) done++;
                      }
                      window.alert(`${done} photo${done > 1 ? "s" : ""} envoyée${done > 1 ? "s" : ""} à la bibliothèque du studio.`);
                      setSelected(new Set());
                    }}
                  >
                    Envoyer au studio
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        {tab === "files" && (
          <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            {items.files.length === 0 && <li className="px-4 py-6 text-center text-[15px] text-text-2">Aucun fichier.</li>}
            {items.files.map(({ m, x }) => (
              <li key={`${m.id}:${x.key}`}>
                <a href={mediaUrl(x.key)} target="_blank" rel="noreferrer" className="pressable flex items-center gap-3 px-4 py-2.5">
                  <FileText size={20} strokeWidth={1.75} className="text-text-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">{x.name ?? "Fichier"}</span>
                    <span className="block text-[12px] text-text-3">{formatDateTime(m.created_at)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {tab === "links" && (
          <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            {items.links.length === 0 && <li className="px-4 py-6 text-center text-[15px] text-text-2">Aucun lien.</li>}
            {items.links.map(({ m, u }, i) => (
              <li key={`${m.id}-${i}`}>
                <a href={u} target="_blank" rel="noreferrer" className="pressable block truncate px-4 py-2.5 text-[15px] text-navy-link">
                  {u}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

function AddMembersSheet({ open, onClose, info, onDone }: { open: boolean; onClose: () => void; info: ChannelInfo; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => messagingDirectory(q.trim() || null).then((l) => setPeople(l.filter((p) => !info.members.some((m) => m.id === p.id)))), 200);
    return () => clearTimeout(t);
  }, [q, open, info.members]);
  const groups = groupDirectory(people);
  return (
    <Sheet open={open} onClose={onClose} title="Ajouter des membres" tall>
      <div className="space-y-3 px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une personne" aria-label="Rechercher une personne" className="h-11 w-full rounded-[12px] bg-bg-1 px-3 text-[16px] text-text-1 outline-none placeholder:text-text-3" />
        {groups.map((g) => (
          <section key={g.title} className="space-y-1.5">
            <h3 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{g.title}</h3>
            <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
              {g.people.map((p) => {
                const on = chosen.includes(p.id);
                return (
                  <li key={p.id}>
                    <button type="button" aria-pressed={on} onClick={() => setChosen((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))} className={cn("pressable flex w-full items-center gap-3 px-4 py-2.5 text-left", on && "bg-bg-2")}>
                      <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" />
                      <span className="flex-1 text-[15px] text-text-1">
                        {p.first_name} {p.last_name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <Button
          type="button"
          disabled={chosen.length === 0}
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await addMembers(info.id, chosen);
              toast(r.ok ? "Membres ajoutés" : r.error);
              if (r.ok) {
                setChosen([]);
                onClose();
                onDone();
              }
            })
          }
        >
          Ajouter ({chosen.length})
        </Button>
      </div>
    </Sheet>
  );
}

function EditSheet({ open, onClose, info, onDone }: { open: boolean; onClose: () => void; info: ChannelInfo; onDone: () => void }) {
  const [name, setName] = useState(info.name);
  const [subject, setSubject] = useState(info.subject ?? "");
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(info.ends_at));
  const [mediaOk, setMediaOk] = useState(info.members_can_post_media);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Modifier le groupe">
      <form
        className="space-y-4 px-3 pb-[max(env(safe-area-inset-bottom),16px)]"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateGroup(info.id, { name, subject, ends_at: endsAt ? new Date(endsAt).toISOString() : null, members_can_post_media: mediaOk });
            toast(r.ok ? "Groupe modifié" : r.error);
            if (r.ok) {
              onClose();
              onDone();
            }
          });
        }}
      >
        <Field label="Nom" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={MESSAGE_LIMITS.groupNameMax} required />
        <Field label="Objet" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MESSAGE_LIMITS.subjectMax} required />
        <Field label="Fin du groupe" name="ends_at" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} hint="Vide : sans date de fin." />
        <CheckboxField label="Les membres peuvent envoyer des médias" name="media_ok" checked={mediaOk} onChange={(e) => setMediaOk(e.target.checked)} />
        <Button type="submit" loading={pending}>
          Enregistrer
        </Button>
      </form>
    </Sheet>
  );
}
