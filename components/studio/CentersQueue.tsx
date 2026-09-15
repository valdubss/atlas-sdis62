"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { promotePost, reviewEvent, reviewPost } from "@/app/(studio)/studio/centres/actions";
import type { PendingEvent, PendingPost } from "@/lib/centres/queries";
import type { Grouping } from "@/lib/supabase/database.types";
import type { FeedPost } from "@/lib/feed/types";
import { eventWhen } from "@/lib/agenda/format";
import { formatRelative } from "@/lib/format";
import { PostCard } from "@/components/feed/PostCard";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import { TextareaField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type Published = FeedPost & { center: { id: string; name: string; slug: string } | null; promoted: boolean };

/**
 * Studio → Centres : file de validation des propositions des référents
 * (publications et événements), groupées par centre, filtre par groupement,
 * puis promotion au fil des publications de centre déjà validées.
 */
export function CentersQueue({ posts, events, published, groupings }: { posts: PendingPost[]; events: PendingEvent[]; published: Published[]; groupings: Grouping[] }) {
  const [grouping, setGrouping] = useState<string>("");
  const [decline, setDecline] = useState<{ kind: "post" | "event"; id: string; title: string } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const filteredPosts = useMemo(() => posts.filter((p) => !grouping || p.center?.grouping_id === grouping), [posts, grouping]);
  const filteredEvents = useMemo(() => events.filter((e) => !grouping || e.center?.grouping_id === grouping), [events, grouping]);
  const byCenter = useMemo(() => {
    const map = new Map<string, { name: string; posts: PendingPost[]; events: PendingEvent[] }>();
    for (const p of filteredPosts) {
      const k = p.center?.id ?? "?";
      map.set(k, { name: p.center?.name ?? "Centre inconnu", posts: [...(map.get(k)?.posts ?? []), p], events: map.get(k)?.events ?? [] });
    }
    for (const e of filteredEvents) {
      const k = e.center?.id ?? "?";
      map.set(k, { name: e.center?.name ?? "Centre inconnu", posts: map.get(k)?.posts ?? [], events: [...(map.get(k)?.events ?? []), e] });
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filteredPosts, filteredEvents]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string) {
    start(async () => {
      const r = await fn();
      toast(r.ok ? okMessage : (r.error ?? "Erreur"));
      if (r.ok) {
        setDecline(null);
        setMessage("");
        router.refresh();
      }
    });
  }

  const total = posts.length + events.length;

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Centres</h1>
          <p className="text-[13px] text-text-3">
            {total === 0 ? "Aucune proposition en attente." : `${total} proposition${total > 1 ? "s" : ""} en attente de validation.`}{" "}
            <Link href="/studio/centres/referentiel" className="text-navy-link">
              Référentiel des centres et services
            </Link>
          </p>
        </div>
        {groupings.length > 0 && (
          <select aria-label="Groupement" value={grouping} onChange={(e) => setGrouping(e.target.value)} className="h-10 appearance-none rounded-[10px] bg-bg-1 px-3 text-[15px] text-text-1">
            <option value="">Tous les groupements</option>
            {groupings.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {byCenter.length === 0 ? (
        <p className="rounded-[16px] bg-bg-1 px-5 py-8 text-center text-[15px] text-text-2">Rien à valider pour le moment. Les propositions des référents apparaîtront ici.</p>
      ) : (
        byCenter.map(([centerId, group]) => (
          <section key={centerId} className="space-y-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
              {group.name} <span className="text-text-3">{group.posts.length + group.events.length}</span>
            </h2>
            {group.posts.map((p) => (
              <article key={p.id} className="space-y-3 rounded-[16px] bg-bg-1 p-3 sm:p-4">
                <div className="flex items-center gap-3 px-1">
                  <Avatar name={p.submitter ? `${p.submitter.first_name} ${p.submitter.last_name}` : null} avatarKey={p.submitter?.avatar_key} size="sm" />
                  <p className="min-w-0 flex-1 text-[13px] text-text-2">
                    Proposé par <span className="text-text-1">{p.submitter ? `${p.submitter.first_name} ${p.submitter.last_name}` : "un référent"}</span> · {formatRelative(p.created_at)}
                  </p>
                  <Badge>{p.type === "photo" ? "Photos" : p.type === "video" ? "Vidéo" : "Annonce"}</Badge>
                </div>
                <div className="mx-auto max-w-[420px]">
                  <PostCard post={p} preview />
                </div>
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <Button size="md" disabled={pending} onClick={() => run(() => reviewPost(p.id, "published"), "Publié sur la page du centre")}>
                    Valider
                  </Button>
                  <Link href={`/studio/posts/${p.id}`} className="pressable inline-flex h-11 items-center rounded-[10px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1">
                    Retoucher
                  </Link>
                  <Button variant="danger" size="md" disabled={pending} onClick={() => setDecline({ kind: "post", id: p.id, title: p.title ?? p.body?.slice(0, 60) ?? "Proposition" })}>
                    Refuser
                  </Button>
                </div>
              </article>
            ))}
            {group.events.map((e) => (
              <article key={e.id} className="flex flex-wrap items-center gap-3 rounded-[16px] bg-bg-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-text-1">{e.title}</p>
                  <p className="text-[13px] text-text-3">
                    {eventWhen(e)}
                    {e.location && ` · ${e.location}`} · proposé par {e.submitter ? `${e.submitter.first_name} ${e.submitter.last_name}` : "un référent"}
                  </p>
                  {e.description && <p className="mt-1 whitespace-pre-line text-[13px] text-text-2">{e.description}</p>}
                </div>
                <Badge>Événement</Badge>
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => run(() => reviewEvent(e.id, "published"), "Événement publié sur la page du centre")}>
                    Valider
                  </Button>
                  <Button variant="danger" size="sm" disabled={pending} onClick={() => setDecline({ kind: "event", id: e.id, title: e.title })}>
                    Refuser
                  </Button>
                </div>
              </article>
            ))}
          </section>
        ))
      )}

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Publiées sur les pages de centre</h2>
        <p className="text-[13px] text-text-3">« Publier aussi dans le fil » crée une publication départementale distincte, créditée « Vie des centres », dans la série « Dans les coulisses ». C&apos;est le seul chemin d&apos;un contenu de centre vers le fil.</p>
        <div className="hairline rounded-[16px] bg-bg-1">
          {published.length === 0 ? (
            <p className="px-5 py-6 text-[15px] text-text-2">Aucune publication de centre pour le moment.</p>
          ) : (
            published.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-text-1">{p.title ?? p.body?.slice(0, 80) ?? "Sans titre"}</p>
                  <p className="text-[13px] text-text-3">
                    {p.center?.name ?? "Centre"} · {formatRelative(p.published_at)}
                  </p>
                </div>
                {p.promoted ? (
                  <Badge tone="success">Dans le fil</Badge>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => promotePost(p.id), "Publié dans le fil départemental")}
                    className={cn("pressable rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] font-medium text-text-1", pending && "opacity-50")}
                  >
                    Publier aussi dans le fil
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <Sheet open={decline !== null} onClose={() => setDecline(null)} title="Refuser la proposition">
        {decline && (
          <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <p className="text-[15px] text-text-2">
              « {decline.title} » sera écartée. Le référent recevra votre message et pourra proposer une nouvelle version.
            </p>
            <TextareaField label="Message pour le référent" name="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} placeholder="Exemple : photos trop sombres, pouvez-vous en reprendre de jour ?" />
            <Button variant="danger" size="md" disabled={pending || message.trim().length < 3} onClick={() => run(() => (decline.kind === "post" ? reviewPost(decline.id, "declined", message) : reviewEvent(decline.id, "declined", message)), "Proposition refusée, référent prévenu")}>
              Refuser et prévenir
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
