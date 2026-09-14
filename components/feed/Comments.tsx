"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchComments, moderateComment, postComment, reportComment } from "@/app/(app)/feed-actions";
import type { CommentItem } from "@/lib/feed/types";
import { formatRelative } from "@/lib/format";
import { LIMITS } from "@/lib/config";
import { Avatar } from "@/components/ui/Avatar";
import { EcgLoader } from "@/components/brand/Ecg";
import { cn } from "@/lib/cn";

/**
 * Liste + composeur de commentaires. Un seul niveau de réponse.
 * Temps réel : abonnement postgres_changes sur la table comments (filtré par post).
 */
export function Comments({
  postId,
  enabled,
  canModerate,
  onCountChange,
  autoFocus,
}: {
  postId: string;
  enabled: boolean;
  canModerate: boolean;
  onCountChange?: (n: number) => void;
  autoFocus?: boolean;
}) {
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const reload = useCallback(async () => {
    const list = await fetchComments(postId);
    setItems(list);
    onCountChange?.(list.filter((c) => c.status === "visible").length);
  }, [postId, onCountChange]);

  useEffect(() => {
    reload();
    const supabase = createClient();
    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, reload]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const res = await postComment({ post_id: postId, parent_id: replyTo?.id ?? null, body: text });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      setReplyTo(null);
      await reload();
    });
  }

  const roots = (items ?? []).filter((c) => !c.parent_id);
  const repliesOf = (id: string) => (items ?? []).filter((c) => c.parent_id === id);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1 px-4 pb-4">
        {items === null ? (
          <EcgLoader label="Chargement des commentaires" />
        ) : roots.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {enabled ? "Soyez le premier à commenter." : "Les commentaires sont désactivés."}
          </p>
        ) : (
          roots.map((c) => (
            <div key={c.id}>
              <CommentRow
                comment={c}
                canModerate={canModerate}
                onReply={enabled ? () => {
                  setReplyTo(c);
                  inputRef.current?.focus();
                } : undefined}
                onChanged={reload}
              />
              {repliesOf(c.id).map((r) => (
                <CommentRow key={r.id} comment={r} canModerate={canModerate} onChanged={reload} reply />
              ))}
            </div>
          ))
        )}
      </div>

      {enabled && (
        <div className="sticky bottom-0 border-t border-line bg-surface px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
          {replyTo && (
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>
                Réponse à <strong className="text-navy">{replyTo.author.name ?? "un agent"}</strong>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="font-semibold text-navy">
                Annuler
              </button>
            </div>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              ref={inputRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={LIMITS.commentMaxLength}
              placeholder="Ajouter un commentaire…"
              aria-label="Votre commentaire"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-base leading-snug text-body placeholder:text-muted/70 focus:border-navy focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="h-11 rounded-full bg-red px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              Publier
            </button>
          </form>
          {error && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  canModerate,
  onReply,
  onChanged,
  reply = false,
}: {
  comment: CommentItem;
  canModerate: boolean;
  onReply?: () => void;
  onChanged: () => void;
  reply?: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hidden = comment.status !== "visible";

  if (hidden && !canModerate) return null;

  return (
    <div className={cn("flex gap-3 py-2", reply && "ml-10")}>
      <Avatar name={comment.author.name} avatarKey={comment.author.avatar_key} size="sm" />
      <div className="min-w-0 flex-1">
        <div className={cn("rounded-2xl bg-surface-2 px-3 py-2", hidden && "opacity-50")}>
          <p className="text-sm">
            <span className="font-semibold text-navy">{comment.author.name ?? "Agent"}</span>
            {comment.author.center && <span className="text-muted"> · {comment.author.center}</span>}
          </p>
          <p className="whitespace-pre-line break-words text-[15px] leading-snug text-body">{comment.body}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-xs text-muted">
          <span>{formatRelative(comment.created_at)}</span>
          {comment.edited_at && <span>modifié</span>}
          {hidden && <span className="font-semibold text-danger">masqué</span>}
          {onReply && (
            <button type="button" onClick={onReply} className="font-semibold text-navy">
              Répondre
            </button>
          )}
          {!comment.is_mine && !hidden && (
            <button type="button" onClick={() => setReporting((v) => !v)} className="font-semibold">
              Signaler
            </button>
          )}
          {canModerate && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await moderateComment(comment.id, hidden ? "visible" : "hidden");
                  setFeedback(res.ok ? null : res.error);
                  onChanged();
                })
              }
              className="font-semibold text-red-text"
            >
              {hidden ? "Rétablir" : "Masquer"}
            </button>
          )}
        </div>
        {reporting && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await reportComment({ comment_id: comment.id, reason });
                setFeedback(res.ok ? "Merci, le signalement est transmis au service communication." : res.error);
                if (res.ok) {
                  setReporting(false);
                  setReason("");
                }
              });
            }}
          >
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Raison du signalement"
              aria-label="Raison du signalement"
              className="h-9 flex-1 rounded-lg border border-line bg-surface px-2 text-sm"
              required
              minLength={3}
            />
            <button type="submit" disabled={pending} className="h-9 rounded-lg bg-navy px-3 text-xs font-bold text-white">
              Envoyer
            </button>
          </form>
        )}
        {feedback && (
          <p className="mt-1 px-1 text-xs text-muted" role="status">
            {feedback}
          </p>
        )}
      </div>
    </div>
  );
}
