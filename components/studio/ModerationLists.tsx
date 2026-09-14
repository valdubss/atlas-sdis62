"use client";

import Link from "next/link";
import { useTransition } from "react";
import { resolveReport, setCommentStatus, setPostComments } from "@/app/(studio)/studio/moderation/actions";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";

type Person = { first_name: string; last_name: string } | null;
type PostRef = { id: string; slug: string; title: string | null; comments_enabled: boolean } | null;

export type RecentComment = { id: string; body: string; status: string; created_at: string; author: Person; post: PostRef };
export type HiddenComment = RecentComment;
export type Report = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter: Person;
  comment: RecentComment | null;
};

const name = (p: Person) => (p ? `${p.first_name} ${p.last_name}`.trim() || "Agent" : "Agent supprimé");

function TextButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="text-[13px] font-medium text-text-2 hover:text-text-1 disabled:opacity-40">
      {children}
    </button>
  );
}

function CommentBlock({ c }: { c: RecentComment }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[13px] text-text-3">
        <span className="text-text-2">{name(c.author)}</span> {formatDateTime(c.created_at)}
        {c.post && (
          <>
            {" sur "}
            <Link href={`/post/${c.post.slug}`} className="text-navy-link underline underline-offset-2" target="_blank">
              {c.post.title ?? "une publication"}
            </Link>
          </>
        )}
      </p>
      <p className="mt-0.5 whitespace-pre-line break-words text-[15px] text-text-1">{c.body}</p>
    </div>
  );
}

export function ModerationLists({ reports, hidden, recent }: { reports: Report[]; hidden: HiddenComment[]; recent: RecentComment[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string) {
    start(async () => {
      const res = await fn();
      toast(res.ok ? okMessage : (res.error ?? "Erreur"));
    });
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Modération</h1>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          Signalements <span className="text-text-3">{reports.length}</span>
        </h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {reports.length === 0 ? (
            <EmptyState title="Aucun signalement en attente" />
          ) : (
            reports.map((r) => (
              <div key={r.id} className="space-y-3 px-5 py-4">
                <p className="text-[13px] text-text-3">
                  Signalé par <span className="text-text-2">{name(r.reporter)}</span> {formatDateTime(r.created_at)} : « {r.reason} »
                </p>
                {r.comment ? <CommentBlock c={r.comment} /> : <p className="text-[15px] text-text-2">Commentaire supprimé.</p>}
                <div className="flex gap-5">
                  <TextButton disabled={pending} onClick={() => run(() => resolveReport(r.id, "hide"), "Commentaire masqué")}>
                    Masquer le commentaire
                  </TextButton>
                  <TextButton disabled={pending} onClick={() => run(() => resolveReport(r.id, "dismiss"), "Signalement classé")}>
                    Laisser en ligne
                  </TextButton>
                  {r.comment?.post?.comments_enabled && (
                    <TextButton disabled={pending} onClick={() => run(() => setPostComments(r.comment!.post!.id, false), "Commentaires désactivés sur la publication")}>
                      Fermer les commentaires de la publication
                    </TextButton>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          Commentaires masqués <span className="text-text-3">{hidden.length}</span>
        </h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {hidden.length === 0 ? (
            <EmptyState title="Aucun commentaire masqué" />
          ) : (
            hidden.map((c) => (
              <div key={c.id} className="flex items-start gap-4 px-5 py-4">
                <CommentBlock c={c} />
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <TextButton disabled={pending} onClick={() => run(() => setCommentStatus(c.id, "visible"), "Commentaire rétabli")}>
                    Rétablir
                  </TextButton>
                  <TextButton disabled={pending} onClick={() => run(() => setCommentStatus(c.id, "deleted"), "Commentaire supprimé")}>
                    Supprimer
                  </TextButton>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Derniers commentaires</h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {recent.length === 0 ? (
            <EmptyState title="Aucun commentaire" />
          ) : (
            recent.map((c) => (
              <div key={c.id} className="flex items-start gap-4 px-5 py-4">
                <CommentBlock c={c} />
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <TextButton disabled={pending} onClick={() => run(() => setCommentStatus(c.id, "hidden"), "Commentaire masqué")}>
                    Masquer
                  </TextButton>
                  {c.post && (
                    <TextButton disabled={pending} onClick={() => run(() => setPostComments(c.post!.id, !c.post!.comments_enabled), c.post!.comments_enabled ? "Commentaires désactivés" : "Commentaires réactivés")}>
                      {c.post.comments_enabled ? "Fermer les commentaires" : "Rouvrir les commentaires"}
                    </TextButton>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
