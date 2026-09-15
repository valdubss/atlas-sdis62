"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { History, Lock, MessageSquare } from "lucide-react";
import { acquireLock, addReviewComment, decideReview, getReview, listEditors, listVersions, releaseLock, requestReview, resolveReviewComment, restoreVersion, type LockInfo, type ReviewComment, type ReviewInfo, type VersionRow } from "@/app/(studio)/studio/posts/draft-actions";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextareaField, SelectField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/**
 * Verrou d'édition partagé : « Modifié par Prénom — il y a 2 min », prise de main
 * possible après 10 min d'inactivité. Rafraîchi toutes les 60 s, libéré en quittant.
 */
export function DraftLock({ postId, onLocked }: { postId: string; onLocked: (mine: boolean) => void }) {
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const tick = useRef(0);

  useEffect(() => {
    let alive = true;
    const run = async (force = false) => {
      const r = await acquireLock(postId, force);
      if (!alive) return;
      setLock(r.lock);
      onLocked(r.ok);
      tick.current++;
    };
    run();
    const timer = setInterval(() => run(), 60_000);
    const release = () => {
      releaseLock(postId).catch(() => {});
    };
    window.addEventListener("pagehide", release);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      releaseLock(postId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un cycle par publication
  }, [postId]);

  if (!lock || lock.mine) return null;
  const who = lock.locked_by?.name ?? "un autre éditeur";
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-[12px] bg-bg-2 px-4 py-3 text-[13px] text-text-1">
      <Lock size={16} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        Modifié par <strong className="font-semibold">{who}</strong>
        {lock.lock_at && <span className="text-text-3"> — {formatRelative(lock.lock_at)}</span>}. Vos changements ne seront pas enregistrés automatiquement.
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending || !lock.stale}
        title={lock.stale ? undefined : "Possible après 10 min d'inactivité"}
        onClick={() =>
          start(async () => {
            const r = await acquireLock(postId, true);
            setLock(r.lock);
            onLocked(r.ok);
            toast(r.ok ? "Vous avez la main" : r.error);
          })
        }
      >
        Prendre la main
      </Button>
    </div>
  );
}

/** Historique des versions (30 dernières), restauration en un tap. */
export function VersionHistory({ postId, onRestored }: { postId: string; onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    listVersions(postId).then(setVersions);
  }, [open, postId]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pressable flex h-9 items-center gap-1.5 rounded-[10px] bg-bg-2 px-3 text-[13px] font-medium text-text-1">
        <History size={14} strokeWidth={1.75} aria-hidden="true" /> Versions
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Versions" tall>
        <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          {versions === null ? (
            <p className="py-6 text-[15px] text-text-2">Chargement…</p>
          ) : versions.length === 0 ? (
            <p className="py-6 text-[15px] text-text-2">Aucune version enregistrée.</p>
          ) : (
            <ul className="hairline">
              {versions.map((v) => (
                <li key={v.version} className="flex items-start gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-text-1">
                      Version {v.version} <span className="text-text-3">· {formatDateTime(v.saved_at)}{v.saved_by ? ` · ${v.saved_by.name}` : ""}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] text-text-2">{v.snapshot.title ?? v.snapshot.body?.slice(0, 120) ?? "—"}</span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await restoreVersion(postId, v.version);
                        toast(r.ok ? `Version ${v.version} restaurée` : r.error);
                        if (r.ok) {
                          setOpen(false);
                          onRestored();
                        }
                      })
                    }
                  >
                    Restaurer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}

const REVIEW_LABEL: Record<ReviewInfo["status"], { label: string; tone: "neutral" | "navy" | "success" | "red" }> = {
  none: { label: "Sans relecture", tone: "neutral" },
  requested: { label: "En relecture", tone: "navy" },
  approved: { label: "Relecture validée", tone: "success" },
  returned: { label: "Renvoyée", tone: "red" },
};

/** Demande de relecture, commentaires internes (invisibles des agents), validation ou renvoi. */
export function ReviewPanel({ postId, isAdmin, onChanged }: { postId: string; isAdmin: boolean; onChanged: (status: ReviewInfo["status"]) => void }) {
  const [data, setData] = useState<{ review: ReviewInfo; comments: ReviewComment[] } | null>(null);
  const [editors, setEditors] = useState<{ id: string; name: string; role: string }[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  async function refresh() {
    const d = await getReview(postId);
    setData(d);
    if (d) onChanged(d.review.status);
  }
  useEffect(() => {
    refresh();
    listEditors().then((e) => {
      setEditors(e);
      setReviewer((r) => r || e[0]?.id || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial
  }, [postId]);

  if (!data) return null;
  const { review, comments } = data;
  const st = REVIEW_LABEL[review.status];
  const open = comments.filter((c) => !c.resolved_at);

  return (
    <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          <MessageSquare size={18} strokeWidth={1.75} className="text-text-3" aria-hidden="true" /> Relecture
        </h2>
        <Badge tone={st.tone}>{st.label}</Badge>
        {review.status === "requested" && review.requested_to && <span className="text-[13px] text-text-3">demandée à {review.requested_to.name}{review.requested_at ? ` · ${formatRelative(review.requested_at)}` : ""}</span>}
        {(review.status === "approved" || review.status === "returned") && review.decided_by && <span className="text-[13px] text-text-3">par {review.decided_by.name}{review.decided_at ? ` · ${formatRelative(review.decided_at)}` : ""}</span>}
      </div>
      {review.status === "requested" && !isAdmin && <p className="text-[13px] text-text-2">La publication est bloquée jusqu&apos;à validation par un éditeur. Un administrateur peut passer outre.</p>}

      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className={cn("rounded-[10px] bg-bg-2 px-3 py-2 text-[13px]", c.resolved_at && "opacity-60")}>
              <p className="text-text-3">
                {c.author?.name ?? "Éditeur"} · {formatRelative(c.created_at)}
                {c.resolved_at && " · résolu"}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-text-1">{c.body}</p>
              {!c.resolved_at && (
                <button type="button" disabled={pending} onClick={() => start(async () => { await resolveReviewComment(c.id); await refresh(); })} className="mt-1 text-[12px] font-medium text-text-3 hover:text-text-1">
                  Marquer résolu
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <TextareaField label={review.status === "requested" ? "Commentaire interne" : "Message pour le relecteur (facultatif)"} name="review_message" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={2000} hint="Visible des éditeurs seulement, jamais des agents." />

      <div className="flex flex-wrap items-end gap-2">
        {review.status !== "requested" && (
          <>
            <SelectField label="Relecteur" name="reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="min-w-[200px]">
              {editors.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.role === "admin" ? " (admin)" : ""}
                </option>
              ))}
            </SelectField>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={pending || !reviewer}
              onClick={() =>
                start(async () => {
                  const r = await requestReview(postId, reviewer, message);
                  toast(r.ok ? "Relecture demandée" : r.error);
                  if (r.ok) setMessage("");
                  await refresh();
                })
              }
            >
              Demander une relecture
            </Button>
          </>
        )}
        {review.status === "requested" && (
          <>
            <Button type="button" size="md" disabled={pending} onClick={() => start(async () => { const r = await decideReview(postId, "approved", message); toast(r.ok ? "Relecture validée" : r.error); setMessage(""); await refresh(); })}>
              Valider
            </Button>
            <Button type="button" variant="danger" size="md" disabled={pending} onClick={() => start(async () => { const r = await decideReview(postId, "returned", message); toast(r.ok ? "Renvoyée à l'auteur" : r.error); setMessage(""); await refresh(); })}>
              Renvoyer
            </Button>
            <Button type="button" variant="tertiary" size="md" disabled={pending || !message.trim()} onClick={() => start(async () => { const r = await addReviewComment(postId, message); toast(r.ok ? "Commentaire ajouté" : r.error); setMessage(""); await refresh(); })}>
              Commenter
            </Button>
          </>
        )}
        {open.length > 0 && <span className="text-[13px] text-text-3">{open.length} point{open.length > 1 ? "s" : ""} à traiter</span>}
      </div>
    </section>
  );
}
