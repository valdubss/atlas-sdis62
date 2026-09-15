"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, CornerUpLeft, Eye, Forward, ImagePlus, Pin, Trash2 } from "lucide-react";
import type { Conversation, Message, SeenBy } from "@/lib/messages/types";
import { MESSAGE_EMOJIS } from "@/lib/messages/types";
import { canDeleteOwn } from "@/lib/messages/helpers";
import { deleteMessage, forwardMessage, listConversations, messageSeenBy, pinMessage, setMessageReaction } from "@/app/(app)/messages/actions";
import { importMessageMedia } from "@/app/(app)/messages/media-actions";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * Feuille d'actions d'un message (appui long) : six emojis puis Répondre,
 * Transférer, Copier, Épingler, Vu par, Utiliser dans un post, Supprimer.
 */
export function MessageActions({
  m,
  mine,
  isEditor,
  onClose,
  onReply,
  onChanged,
}: {
  m: Message | null;
  mine: boolean;
  isEditor: boolean;
  onClose: () => void;
  onReply: (m: Message) => void;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [view, setView] = useState<"actions" | "forward" | "seen">("actions");
  const [targets, setTargets] = useState<Conversation[]>([]);
  const [seen, setSeen] = useState<SeenBy | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!m) setView("actions");
  }, [m]);

  if (!m) return null;
  const mineReaction = m.reactions.find((r) => r.mine)?.emoji ?? null;
  const canDelete = isEditor || (mine && canDeleteOwn(m.created_at));
  const image = m.media?.findIndex((x) => x.kind === "image") ?? -1;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Erreur");
      else {
        if (done) toast(done);
        onChanged();
        onClose();
      }
    });
  }

  return (
    <Sheet open={Boolean(m)} onClose={onClose} title={view === "forward" ? "Transférer vers…" : view === "seen" ? "Vu par" : "Message"}>
      {view === "actions" && (
        <div className="space-y-2 px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
          {!m.deleted_at && (
            <div className="flex items-center justify-around rounded-[16px] bg-bg-1 py-2" role="group" aria-label="Réagir">
              {MESSAGE_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={pending}
                  aria-pressed={mineReaction === e}
                  aria-label={`Réagir ${e}`}
                  onClick={() => {
                    haptic();
                    run(() => setMessageReaction(m.id, mineReaction === e ? null : e));
                  }}
                  className={cn("flex h-11 w-11 items-center justify-center rounded-full text-[26px] leading-none", mineReaction === e && "bg-bg-2 ring-1 ring-text-1")}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
            {!m.deleted_at && (
              <Item icon={CornerUpLeft} label="Répondre" onClick={() => { onReply(m); onClose(); }} />
            )}
            {!m.deleted_at && (
              <Item
                icon={Forward}
                label="Transférer"
                onClick={() => {
                  setView("forward");
                  listConversations().then((l) => setTargets(l.filter((c) => c.id !== m.channel_id && !c.read_only && !c.archived_at)));
                }}
              />
            )}
            {m.body && (
              <Item
                icon={Copy}
                label="Copier le texte"
                onClick={() => {
                  navigator.clipboard?.writeText(m.body ?? "").then(() => toast("Texte copié")).catch(() => {});
                  onClose();
                }}
              />
            )}
            {isEditor && !m.deleted_at && <Item icon={Pin} label={m.pinned_at ? "Désépingler" : "Épingler (3 max)"} onClick={() => run(() => pinMessage(m.id, !m.pinned_at), m.pinned_at ? "Message désépinglé" : "Message épinglé")} />}
            {mine && (
              <Item
                icon={Eye}
                label="Vu par…"
                onClick={() => {
                  setView("seen");
                  messageSeenBy(m.id).then(setSeen);
                }}
              />
            )}
            {isEditor && image >= 0 && (
              <Item
                icon={ImagePlus}
                label="Utiliser dans un post"
                onClick={() =>
                  start(async () => {
                    const r = await importMessageMedia(m.id, image);
                    if (!r.ok) toast(r.error);
                    else {
                      toast("Photo ajoutée à la bibliothèque du studio");
                      window.location.href = `/studio/posts/new?type=photo&media=${r.mediaId}`;
                    }
                  })
                }
              />
            )}
            {canDelete && !m.deleted_at && (
              <Item
                icon={Trash2}
                label={mine && !isEditor ? "Supprimer (15 min)" : "Supprimer"}
                danger
                onClick={() => {
                  if (window.confirm("Supprimer ce message pour tout le monde ?")) run(() => deleteMessage(m.id), "Message supprimé");
                }}
              />
            )}
          </ul>
        </div>
      )}
      {view === "forward" && (
        <ul className="hairline mx-3 mb-[max(env(safe-area-inset-bottom),16px)] overflow-hidden rounded-[16px] bg-bg-1">
          {targets.length === 0 && <li className="px-4 py-6 text-center text-[15px] text-text-2">Aucune autre conversation.</li>}
          {targets.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={pending} onClick={() => run(() => forwardMessage(m.id, c.id), `Transféré dans ${c.name}`)} className="pressable flex h-12 w-full items-center px-4 text-left text-[15px] text-text-1">
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {view === "seen" && (
        <ul className="hairline mx-3 mb-[max(env(safe-area-inset-bottom),16px)] overflow-hidden rounded-[16px] bg-bg-1">
          {seen === null && <li className="px-4 py-6 text-center text-[15px] text-text-2">Chargement…</li>}
          {seen?.length === 0 && <li className="px-4 py-6 text-center text-[15px] text-text-2">Personne n&apos;a encore lu ce message.</li>}
          {seen?.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={p.name} avatarKey={p.avatar_key} size="sm" />
              <span className="flex-1 text-[15px] text-text-1">{p.name}</span>
              <span className="text-[12px] text-text-3">{new Date(p.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function Item({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cn("pressable flex h-12 w-full items-center gap-3 px-4 text-left text-[15px]", danger ? "text-red-text" : "text-text-1")}>
        <Icon size={18} strokeWidth={1.75} />
        {label}
      </button>
    </li>
  );
}
