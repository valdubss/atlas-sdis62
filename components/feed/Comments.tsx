"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, MessageCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteComment, fetchComments, moderateComment, postComment, reportComment } from "@/app/(app)/feed-actions";
import type { CommentItem } from "@/lib/feed/types";
import { formatRelative } from "@/lib/format";
import { LIMITS } from "@/lib/config";
import { haptic } from "@/lib/motion";
import { Avatar } from "@/components/ui/Avatar";
import { CommentSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { cn } from "@/lib/cn";

type Item = CommentItem & { pending?: boolean };

/**
 * Commentaires d'une publication : fils à un niveau (réponses repliées sous
 * « Voir les N réponses »), composeur épinglé en bas, envoi optimiste, temps
 * réel Supabase (relecture regroupée). Signalement et modération en place.
 *
 * `layout="sheet"` : liste défilante + composeur fixe (feuille du fil).
 * `clearNav` : page de lecture avec la barre basse visible, le composeur
 * reste au-dessus d'elle.
 */
export function Comments({
  postId,
  enabled,
  canModerate,
  onCountChange,
  autoFocus,
  layout = "inline",
  clearNav = false,
}: {
  postId: string;
  enabled: boolean;
  canModerate: boolean;
  onCountChange?: (n: number) => void;
  autoFocus?: boolean;
  layout?: "inline" | "sheet";
  clearNav?: boolean;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [replyTo, setReplyTo] = useState<Item | null>(null);
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const reduced = useReducedMotion();
  const countRef = useRef(onCountChange);
  useEffect(() => {
    countRef.current = onCountChange;
  }, [onCountChange]);

  const reload = useCallback(async () => {
    const list = await fetchComments(postId);
    setItems((prev) => {
      // Les envois encore en cours restent affichés en attendant la version du serveur
      const pending = (prev ?? []).filter((c) => c.pending);
      return [...list, ...pending];
    });
    countRef.current?.(list.filter((c) => c.status === "visible").length);
  }, [postId]);

  useEffect(() => {
    void reload();
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`comments:${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void reload(), 250);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [postId, reload]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Hauteur du champ : suit le texte (1 à 5 lignes)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [body]);

  const threads = useMemo(() => {
    const list = items ?? [];
    const roots = list.filter((c) => !c.parent_id);
    const byParent = new Map<string, Item[]>();
    for (const c of list) {
      if (!c.parent_id) continue;
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
    return roots.map((root) => ({ root, replies: byParent.get(root.id) ?? [] }));
  }, [items]);

  function startReply(target: Item, rootId: string) {
    if (!enabled) return;
    const root = (items ?? []).find((c) => c.id === rootId) ?? target;
    setReplyTo(root);
    // Réponse à une réponse : le prénom est rappelé pour garder le fil lisible
    if (target.id !== rootId && target.author.name) {
      const first = target.author.name.split(/\s+/)[0];
      setBody((b) => (b.startsWith(`@${first}`) ? b : `@${first} ${b}`));
    }
    setExpanded((prev) => new Set(prev).add(rootId));
    inputRef.current?.focus();
  }

  function submit() {
    const text = body.trim();
    if (!text || !enabled) return;
    const parentId = replyTo?.id ?? null;
    const temp: Item = { id: `tmp-${Date.now()}`, post_id: postId, parent_id: parentId, body: text, status: "visible", created_at: new Date().toISOString(), edited_at: null, is_mine: true, author: { name: "Vous", center: null, avatar_key: null }, pending: true };
    setItems((prev) => [...(prev ?? []), temp]);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setBody("");
    setReplyTo(null);
    haptic();
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" }));
    startTransition(async () => {
      const res = await postComment({ post_id: postId, parent_id: parentId, body: text });
      if (!res.ok) {
        setItems((prev) => (prev ?? []).filter((c) => c.id !== temp.id));
        setBody(text);
        if (parentId) setReplyTo((items ?? []).find((c) => c.id === parentId) ?? null);
        toast(res.error);
        return;
      }
      setItems((prev) => (prev ?? []).filter((c) => c.id !== temp.id));
      await reload();
    });
  }

  const sheet = layout === "sheet";
  const remaining = LIMITS.commentMaxLength - body.length;

  return (
    <div className={cn("flex flex-col", sheet ? "min-h-0 flex-1" : "h-full")}>
      <div ref={listRef} className={cn("flex-1 px-4", sheet ? "min-h-0 overflow-y-auto overscroll-contain pb-3" : "pb-2")}>
        {items === null ? (
          <div className="pt-1">
            <CommentSkeleton />
            <CommentSkeleton />
            <CommentSkeleton />
          </div>
        ) : threads.length === 0 ? (
          <EmptyComments enabled={enabled} />
        ) : (
          <ul className="divide-y divide-line/60">
            {threads.map(({ root, replies }) => (
              <Thread
                key={root.id}
                root={root}
                replies={replies}
                canModerate={canModerate}
                enabled={enabled}
                expanded={expanded.has(root.id)}
                onToggle={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(root.id)) next.delete(root.id);
                    else next.add(root.id);
                    return next;
                  })
                }
                onReply={(target) => startReply(target, root.id)}
                onChanged={reload}
              />
            ))}
          </ul>
        )}
      </div>

      {enabled && (
        <div
          className={cn(
            "shrink-0 border-t border-line/60 bg-bg-2 px-3 pt-2",
            sheet ? "pb-[max(env(safe-area-inset-bottom),10px)]" : "sticky z-10 rounded-b-[16px] pb-3",
            !sheet && (clearNav ? "bottom-[calc(max(env(safe-area-inset-bottom),12px)+76px)]" : "bottom-0"),
          )}
        >
          <AnimatePresence initial={false}>
            {replyTo && (
              <motion.div
                key="reply"
                initial={reduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-1.5 flex items-center justify-between gap-3 rounded-[10px] bg-bg-1 px-3 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate text-text-2">
                    Réponse à <span className="font-medium text-text-1">{replyTo.author.name ?? "un agent"}</span>
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Annuler la réponse" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-3 hover:text-text-1">
                    <X size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <form
            className="flex items-end gap-1 rounded-[22px] bg-bg-1 py-1 pl-4 pr-1 ring-1 ring-transparent focus-within:ring-glass-edge"
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
              className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-[1.35] text-text-1 outline-none placeholder:text-text-3"
            />
            {remaining < 100 && <span className={cn("mb-3 shrink-0 text-[11px] tabular-nums", remaining < 20 ? "text-red-text" : "text-text-3")}>{remaining}</span>}
            <button
              type="submit"
              disabled={!body.trim()}
              aria-label="Publier le commentaire"
              className={cn(
                "pressable mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                body.trim() ? "bg-red-fill text-white" : "bg-bg-2 text-text-4",
              )}
            >
              <ArrowUp size={18} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function EmptyComments({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-1 text-text-3">
        <MessageCircle size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="text-[17px] font-semibold text-text-1">{enabled ? "Aucun commentaire" : "Commentaires fermés"}</p>
      <p className="max-w-[260px] text-[14px] text-text-2">{enabled ? "Soyez le premier à réagir." : "Le service communication a fermé les commentaires de cette publication."}</p>
    </div>
  );
}

function Thread({
  root,
  replies,
  canModerate,
  enabled,
  expanded,
  onToggle,
  onReply,
  onChanged,
}: {
  root: Item;
  replies: Item[];
  canModerate: boolean;
  enabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReply: (target: Item) => void;
  onChanged: () => void;
}) {
  const visible = replies.filter((r) => r.status === "visible" || canModerate);
  if (root.status !== "visible" && !canModerate) return null;
  return (
    <li className="py-1">
      <CommentRow comment={root} canModerate={canModerate} onReply={enabled ? () => onReply(root) : undefined} onChanged={onChanged} />
      {visible.length > 0 && (
        <div className="ml-11">
          <button type="button" onClick={onToggle} className="flex min-h-9 items-center gap-2 text-[13px] font-medium text-text-3 hover:text-text-1" aria-expanded={expanded}>
            <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
            {expanded ? "Masquer les réponses" : `Voir ${visible.length === 1 ? "la réponse" : `les ${visible.length} réponses`}`}
          </button>
          {expanded && (
            <ul>
              {visible.map((r) => (
                <li key={r.id}>
                  <CommentRow comment={r} canModerate={canModerate} onReply={enabled ? () => onReply(r) : undefined} onChanged={onChanged} reply />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function CommentRow({
  comment,
  canModerate,
  onReply,
  onChanged,
  reply = false,
}: {
  comment: Item;
  canModerate: boolean;
  onReply?: () => void;
  onChanged: () => void;
  reply?: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const reduced = useReducedMotion();
  const hidden = comment.status !== "visible";
  const name = comment.author.name ?? "Agent";

  return (
    <article className={cn("flex gap-3 py-2.5", (hidden || comment.pending) && "opacity-60")} aria-label={`Commentaire de ${name}`}>
      <Avatar name={comment.author.name} avatarKey={comment.author.avatar_key} size={reply ? "xs" : "sm"} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-tight">
          <span className="font-semibold text-text-1">{name}</span>
          {comment.author.center && <span className="truncate text-text-3">{comment.author.center}</span>}
          <span className="text-text-3">{comment.pending ? "Envoi…" : formatRelative(comment.created_at)}</span>
          {hidden && <span className="rounded-full bg-red-soft px-1.5 text-[11px] font-medium text-red-text">Masqué</span>}
        </p>
        <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-[1.4] text-text-1">{comment.body}</p>
        {!comment.pending && (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 text-[12.5px] font-medium text-text-3">
            {onReply && (
              <button type="button" onClick={onReply} className="min-h-8 hover:text-text-1">
                Répondre
              </button>
            )}
            {!comment.is_mine && !hidden && (
              <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} className="min-h-8 hover:text-text-1">
                Signaler
              </button>
            )}
            {comment.is_mine && (
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  if (!(await confirm({ title: "Supprimer votre commentaire ?", confirmLabel: "Supprimer", danger: true }))) return;
                  startTransition(async () => {
                    const res = await deleteComment(comment.id);
                    if (!res.ok) toast(res.error);
                    onChanged();
                  });
                }}
                className="min-h-8 hover:text-red-text"
              >
                Supprimer
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
                className="min-h-8 hover:text-text-1"
              >
                {hidden ? "Rétablir" : "Masquer"}
              </button>
            )}
          </div>
        )}
        <AnimatePresence initial={false}>
          {reporting && (
            <motion.form
              key="report"
              initial={reduced ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
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
              <div className="mt-2 flex gap-2 pb-1">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Pourquoi signaler ce commentaire ?"
                  aria-label="Raison du signalement"
                  className="h-10 min-w-0 flex-1 rounded-[12px] bg-bg-1 px-3 text-[14px] text-text-1 outline-none ring-1 ring-transparent placeholder:text-text-3 focus:ring-glass-edge"
                  required
                  minLength={3}
                  maxLength={300}
                  autoFocus
                />
                <button type="submit" disabled={pending || reason.trim().length < 3} className="h-10 shrink-0 rounded-[12px] bg-bg-1 px-3 text-[13px] font-semibold text-text-1 disabled:text-text-4">
                  Envoyer
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </article>
  );
}
