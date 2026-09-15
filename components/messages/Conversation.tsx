"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Pin } from "lucide-react";
import type { ChannelInfo, DirectoryPerson, Message, MessageMedia, MessageVoice } from "@/lib/messages/types";
import { bubblePositions, dateLabel, endsIn, needsDateSeparator } from "@/lib/messages/helpers";
import { fetchMessages, markChannelRead, messageSeenBy, sendMessage } from "@/app/(app)/messages/actions";
import { createClient } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/media/url";
import { TopBar } from "@/components/layout/TopBar";
import { AvatarMosaic } from "./AvatarMosaic";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { MessageActions } from "./MessageActions";
import { Lightbox } from "@/components/feed/Lightbox";
import { useToast } from "@/components/ui/Toast";
import { isOnline, offlineQueue } from "@/lib/offline/queue";
import { cn } from "@/lib/cn";

/**
 * Écran de conversation : en-tête (avatar, nom, membres, ⓘ), bandeau des
 * épinglés (3 max), fil de bulles paginé vers le haut (position conservée),
 * accusés « Envoyé » / « Vu par N », composeur en verre, temps réel.
 */
export function Conversation({ info, initial, me, isEditor }: { info: ChannelInfo; initial: Message[]; me: string; isEditor: boolean }) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [hasMore, setHasMore] = useState(initial.length >= 40);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<{ items: { src: string; alt: string }[]; index: number } | null>(null);
  const [pinIndex, setPinIndex] = useState(0);
  const [seenCount, setSeenCount] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const readOnly = info.read_only || Boolean(info.archived_at);
  const people: DirectoryPerson[] = useMemo(() => info.members.map((m) => ({ id: m.id, first_name: m.first_name, last_name: m.last_name, avatar_key: m.avatar_key, role: m.role, center: m.center, grouping: null, is_referent: false })), [info.members]);
  const positions = useMemo(() => bubblePositions(messages), [messages]);
  const pinned = info.pinned;
  const lastMine = [...messages].reverse().find((m) => m.author?.id === me && !m.pending);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Position initiale en bas, lecture marquée
  useEffect(() => {
    scrollToBottom();
    markChannelRead(info.id, initial[initial.length - 1]?.id ?? null).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage
  }, []);

  const reload = useCallback(async () => {
    const latest = await fetchMessages(info.id, null);
    setMessages((prev) => {
      const map = new Map(prev.filter((m) => !m.pending).map((m) => [m.id, m]));
      for (const m of latest) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, [info.id]);

  // Temps réel : messages du canal et réactions
  useEffect(() => {
    const supabase = createClient();
    // Le canal temps réel doit porter le jeton de session pour que la RLS laisse passer les événements
    supabase.auth.getSession().then(({ data }) => data.session && supabase.realtime.setAuth(data.session.access_token));
    const channel = supabase
      .channel(`messages:${info.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_messages", filter: `channel_id=eq.${info.id}` }, (payload) => {
        const row = payload.new as { author_id?: string | null } | null;
        reload().then(() => {
          if (payload.eventType === "INSERT" && row?.author_id !== me) {
            markChannelRead(info.id).catch(() => {});
            if (atBottom) setTimeout(() => scrollToBottom(true), 50);
          }
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [info.id, me, reload, atBottom, scrollToBottom]);

  // Filet de sécurité si le temps réel décroche : relecture toutes les 8 s quand l'écran est visible
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive || document.visibilityState !== "visible") return;
      reload().then(() => {
        if (atBottom) setTimeout(() => scrollToBottom(true), 50);
      });
    };
    const t = setInterval(tick, 8_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload, atBottom, scrollToBottom]);

  // Accusés de lecture de mon dernier message (toutes les 20 s)
  useEffect(() => {
    if (!lastMine) return;
    let alive = true;
    const tick = () => messageSeenBy(lastMine.id).then((s) => alive && setSeenCount(s.length)).catch(() => {});
    tick();
    const t = setInterval(tick, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [lastMine?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    const el = scroller.current;
    if (!el || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const before = messages[0].created_at;
    const older = await fetchMessages(info.id, before);
    const prevHeight = el.scrollHeight;
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    setHasMore(older.length >= 40);
    requestAnimationFrame(() => {
      el.scrollTop += el.scrollHeight - prevHeight;
      setLoadingMore(false);
    });
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (el.scrollTop < 120) void loadMore();
  }

  async function send(payload: { body?: string; media?: MessageMedia[]; voice?: MessageVoice; mentions: string[]; mention_all: boolean }) {
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      channel_id: info.id,
      type: payload.voice ? "voice" : payload.media ? "media" : "text",
      body: payload.body ?? null,
      media: payload.media ?? null,
      voice: payload.voice ?? null,
      mentions: payload.mentions,
      mention_all: payload.mention_all,
      pinned_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      author: { id: me, first_name: "", last_name: "", avatar_key: null, role: "" },
      reply_to: replyTo ? { id: replyTo.id, type: replyTo.type, body: replyTo.body, author: replyTo.author ? `${replyTo.author.first_name} ${replyTo.author.last_name}` : "", has_media: Boolean(replyTo.media) } : null,
      reactions: [],
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => scrollToBottom(true), 30);
    // Hors ligne : texte gardé sur l'appareil (identifiant client), envoyé au retour du réseau
    if (!isOnline() && !payload.media && !payload.voice) {
      const clientId = crypto.randomUUID();
      offlineQueue.enqueue({ kind: "message", client_id: clientId, channel_id: info.id, body: payload.body ?? null, reply_to_id: replyTo?.id ?? null, mentions: payload.mentions, mention_all: payload.mention_all });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, queued: true } : m)));
      toast("Hors ligne : message envoyé dès le retour du réseau");
      return true;
    }
    const r = await sendMessage({ channel_id: info.id, ...payload, reply_to_id: replyTo?.id ?? null });
    if (!r.ok) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      toast(r.error);
      return false;
    }
    setMessages((prev) => [...prev.filter((m) => m.id !== tempId && m.id !== r.message.id), r.message].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    return true;
  }

  function openMedia(m: Message, index: number) {
    const items = (m.media ?? []).filter((x) => x.kind !== "file").map((x) => ({ src: mediaUrl(x.kind === "video" ? (x.poster_key ?? x.key) : x.key), alt: x.name ?? "" }));
    const video = m.media?.[index];
    if (video?.kind === "video") {
      window.open(mediaUrl(video.key), "_blank", "noopener");
      return;
    }
    const idx = (m.media ?? []).filter((x) => x.kind !== "file").indexOf(m.media![index]);
    setLightbox({ items, index: Math.max(0, idx) });
  }

  function jumpTo(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const membersLabel = info.type === "group" ? `${info.members.length} membre${info.members.length > 1 ? "s" : ""}` : info.subject ?? (info.type === "general" ? "Service communication et référents" : "Référents et service communication");
  const countdown = endsIn(info.ends_at);

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-bg-0">
      <TopBar
        leading={
          <Link href="/messages" className="pressable -ml-2 flex h-12 items-center gap-2 pr-2" aria-label="Retour aux messages">
            <ChevronLeft size={22} strokeWidth={1.75} className="text-text-2" />
            <AvatarMosaic photoKey={info.photo_key} people={info.members.slice(0, 4).map((m) => ({ name: `${m.first_name} ${m.last_name}`, avatar_key: m.avatar_key }))} size={32} />
            <span className="min-w-0 leading-tight">
              <span className="block max-w-[46vw] truncate text-[15px] font-semibold text-text-1">{info.name}</span>
              <span className="block max-w-[46vw] truncate text-[11px] text-text-3">{readOnly ? "Lecture seule" : countdown ? `${membersLabel} · fin dans ${countdown}` : membersLabel}</span>
            </span>
          </Link>
        }
        right={
          <Link href={`/messages/${info.id}/infos`} aria-label="Informations" className="pressable flex h-10 w-10 items-center justify-center text-text-2">
            <Info size={22} strokeWidth={1.75} />
          </Link>
        }
      />

      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto pb-3 pt-[calc(48px+env(safe-area-inset-top)+8px)]">
        {pinned.length > 0 && (
          <div className="sticky top-0 z-10 mx-3 mb-2 flex items-center gap-2 rounded-[12px] bg-bg-1/95 px-3 py-2 backdrop-blur">
            <Pin size={14} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
            <button type="button" onClick={() => jumpTo(pinned[pinIndex % pinned.length].id)} className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-semibold text-navy-link">Épinglé {pinned.length > 1 ? `${(pinIndex % pinned.length) + 1}/${pinned.length}` : ""}</span>
              <span className="block truncate text-[13px] text-text-1">{pinned[pinIndex % pinned.length].body ?? "Pièce jointe"}</span>
            </button>
            {pinned.length > 1 && (
              <button type="button" onClick={() => setPinIndex((i) => i + 1)} aria-label="Épinglé suivant" className="flex h-8 w-8 items-center justify-center text-text-3">
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}
        {loadingMore && <p className="py-2 text-center text-[12px] text-text-3">Chargement…</p>}
        {messages.length === 0 && <p className="px-6 py-10 text-center text-[15px] text-text-2">{info.type === "group" ? `Groupe créé pour : ${info.subject}` : "Aucun message pour le moment."}</p>}
        {messages.map((m, i) => (
          <div key={m.id}>
            {needsDateSeparator(messages, i) && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-bg-1 px-3 py-1 text-[12px] text-text-3">{dateLabel(m.created_at)}</span>
              </div>
            )}
            <MessageBubble
              m={m}
              mine={m.author?.id === me}
              pos={positions[m.id] ?? "single"}
              showName={info.type !== "general" || true}
              onLongPress={(msg) => !msg.pending && setActionsFor(msg)}
              onOpenMedia={openMedia}
              onJumpTo={jumpTo}
              receipt={m.id === lastMine?.id && seenCount !== null ? <span className="w-8 shrink-0" /> : undefined}
            />
            {m.id === lastMine?.id && seenCount !== null && (
              <p className="px-6 pt-1 text-right text-[11px] text-text-3">
                {seenCount === 0 ? "Envoyé" : (
                  <button type="button" onClick={() => setActionsFor(m)} className="underline-offset-2 hover:underline">
                    Vu par {seenCount}
                  </button>
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className={cn("shrink-0 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1")}>
        {readOnly ? (
          <p className="rounded-[16px] bg-bg-1 px-4 py-3 text-center text-[13px] text-text-2">{info.archived_at ? "Groupe archivé : lecture seule." : "Conversation en lecture seule."}</p>
        ) : (
          <Composer channelId={info.id} people={people} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={send} mediaAllowed={isEditor || info.members_can_post_media} />
        )}
      </div>

      <MessageActions m={actionsFor} mine={actionsFor?.author?.id === me} isEditor={isEditor} onClose={() => setActionsFor(null)} onReply={setReplyTo} onChanged={() => void reload()} />
      {lightbox && <Lightbox open items={lightbox.items} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
