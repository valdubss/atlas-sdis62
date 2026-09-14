"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchComments, moderateComment, postComment, reportComment } from "@/app/(app)/feed-actions";
import type { CommentItem } from "@/lib/feed/types";
import { formatRelative } from "@/lib/format";
import { LIMITS } from "@/lib/config";
import { Avatar } from "@/components/ui/Avatar";
import { CommentSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
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
  layout = "inline",
}: {
  postId: string;
  enabled: boolean;
  canModerate: boolean;
  onCountChange?: (n: number) => void;
  autoFocus?: boolean;
  /** "sheet" : liste défilante + composeur épinglé en bas (feuille mobile) */
  layout?: "inline" | "sheet";
}) {
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();
  // Le rappel du parent change à chaque rendu : on le garde dans une référence
  // pour ne pas réabonner le canal temps réel en boucle.
  const countRef = useRef(onCountChange);
  useEffect(() => {
    countRef.current = onCountChange;
  }, [onCountChange]);

  const reload = useCallback(async () => {
    const list = await fetchComments(postId);
    setItems(list);
    countRef.current?.(list.filter((c) => c.status === "visible").length);
  }, [postId]);

  useEffect(() => {
    reload();
    const supabase = createClient();
    const channel = supabase
      .channel(`comments:${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => reload())
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
    startTransition(async () => {
      const res = await postComment({ post_id: postId, parent_id: replyTo?.id ?? null, body: text });
      if (!res.ok) {
        toast(res.error);
        return;
      }
      setBody("");
      setReplyTo(null);
      await reload();
    });
  }

  const roots = (items ?? []).filter((c) => !c.parent_id);
  const repliesOf = (id: string) => (items ?? []).filter((c) => c.parent_id === id);

  const sheet = layout === "sheet";

  return (
    <div className={cn("flex flex-col", sheet ? "min-h-0 flex-1" : "h-full")}>
      <div className={cn("flex-1 px-4 pb-4", sheet && "min-h-0 overflow-y-auto overscroll-contain")}>
        {items === null ? (
          <>
            <CommentSkeleton />
            <CommentSkeleton />
          </>
        ) : roots.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-[17px] font-semibold text-text-1">{enabled ? "Aucun commentaire" : "Commentaires désactivés"}</p>
            <p className="text-[15px] text-text-2">{enabled ? "Lancez la conversation." : "Le service communication a fermé les commentaires."}</p>
          </div>
        ) : (
          roots.map((c) => (
            <div key={c.id}>
              <CommentRow
                comment={c}
                canModerate={canModerate}
                onReply={
                  enabled
                    ? () => {
                        setReplyTo(c);
                        inputRef.current?.focus();
                      }
                    : undefined
                }
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
        <div className={cn("bg-bg-2 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2", sheet ? "shrink-0" : "sticky bottom-0")}>
          {replyTo && (
            <div className="mb-1 flex items-center justify-between text-[13px] text-text-3">
              <span>
                Réponse à <span className="text-text-2">{replyTo.author.name ?? "un agent"}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="font-medium text-text-2">
                Annuler
              </button>
            </div>
          )}
          <form
            className="flex items-end gap-2 rounded-[22px] bg-bg-1 py-1 pl-1 pr-2 ring-1 ring-transparent focus-within:ring-glass-edge"
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
              placeholder={replyTo ? "Votre réponse…" : "Ajouter un commentaire…"}
              aria-label="Votre commentaire"
              enterKeyHint="send"
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-[1.4] text-text-1 outline-none"
            />
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="h-10 shrink-0 px-2 text-[15px] font-semibold text-red-text disabled:text-text-4"
            >
              Publier
            </button>
          </form>
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
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const hidden = comment.status !== "visible";

  if (hidden && !canModerate) return null;

  return (
    <div className={cn("flex gap-3 py-2.5", reply && "ml-10")}>
      <Avatar name={comment.author.name} avatarKey={comment.author.avatar_key} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px]", hidden && "opacity-50")}>
          <span className="font-medium text-text-1">{comment.author.name ?? "Agent"}</span>
          {comment.author.center && <span className="text-text-3"> {comment.author.center}</span>}
          <span className="text-text-3"> {formatRelative(comment.created_at)}</span>
          {hidden && <span className="text-red-text"> masqué</span>}
        </p>
        <p className={cn("whitespace-pre-line break-words text-[15px] text-text-1", hidden && "opacity-50")}>{comment.body}</p>
        <div className="mt-1 flex flex-wrap items-center gap-4 text-[13px] font-medium text-text-2">
          {onReply && (
            <button type="button" onClick={onReply} className="hover:text-text-1">
              Répondre
            </button>
          )}
          {!comment.is_mine && !hidden && (
            <button type="button" onClick={() => setReporting((v) => !v)} className="hover:text-text-1">
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
                  if (!res.ok) toast(res.error);
                  onChanged();
                })
              }
              className="hover:text-text-1"
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
                toast(res.ok ? "Signalement transmis au service communication" : res.error);
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
              className="h-9 flex-1 rounded-[10px] bg-bg-1 px-3 text-[13px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
              required
              minLength={3}
            />
            <button type="submit" disabled={pending} className="h-9 rounded-[10px] bg-bg-1 px-3 text-[13px] font-medium text-text-1">
              Envoyer
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
