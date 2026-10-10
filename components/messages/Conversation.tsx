"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronLeft, ChevronRight, Info, Pin, WifiOff } from "lucide-react";
import type { ChannelInfo, DirectoryPerson, Message, MessageMedia, MessageVoice, ReadState } from "@/lib/messages/types";
import { bubblePositions, dateLabel, endsIn, needsDateSeparator, readReceipt } from "@/lib/messages/helpers";
import { editMessage, fetchMessage, fetchMessagesSince, fetchMessages, fetchReadsState, markChannelRead, sendMessage } from "@/app/(app)/messages/actions";
import { createClient } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/media/url";
import { TopBar } from "@/components/layout/TopBar";
import { AvatarMosaic } from "./AvatarMosaic";
import { MessageBubble } from "./MessageBubble";
import { Composer, type SendPayload } from "./Composer";
import { MessageActions } from "./MessageActions";
import { Lightbox } from "@/components/feed/Lightbox";
import { useToast } from "@/components/ui/Toast";
import { isOnline, offlineQueue } from "@/lib/offline/queue";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

type Typing = { name: string; until: number };

/** Dernier horodatage connu du canal (création, modification, suppression) : point de rattrapage. */
function lastStamp(list: Message[]): string | null {
  let max: string | null = null;
  for (const m of list) {
    if (m.pending || m.id.startsWith("tmp-")) continue;
    for (const v of [m.created_at, m.edited_at ?? null, m.deleted_at ?? null]) if (v && (!max || v > max)) max = v;
  }
  return max;
}

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) {
    // Rapprochement avec l'envoi optimiste porteur du même identifiant client
    if (m.client_id) for (const [k, v] of map) if (k.startsWith("tmp-") && v.client_id === m.client_id) map.delete(k);
    map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Écran de conversation : fil de bulles paginé vers le haut, temps réel
 * incrémental (chaque événement ne charge que le message concerné), rattrapage
 * automatique après une coupure, accusés par message (✓ envoyé, ✓✓ lu),
 * « X écrit… », séparateur « nouveaux messages », bouton de retour en bas avec
 * compteur, renvoi des échecs, édition de ses messages, brouillon conservé.
 */
export function Conversation({ info, initial, initialReads, myLastReadAt, me, isEditor }: { info: ChannelInfo; initial: Message[]; initialReads: ReadState; myLastReadAt: string | null; me: string; isEditor: boolean }) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [reads, setReads] = useState<ReadState>(initialReads);
  const [hasMore, setHasMore] = useState(initial.length >= 40);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<{ items: { src: string; alt: string }[]; index: number } | null>(null);
  const [pinIndex, setPinIndex] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [typing, setTyping] = useState<Record<string, Typing>>({});
  const [connected, setConnected] = useState(true);
  const connectedRef = useRef(true);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const messagesRef = useRef(messages);
  const payloads = useRef(new Map<string, SendPayload & { client_id: string; reply_to_id: string | null }>());
  const toast = useToast();
  const readOnly = info.read_only || Boolean(info.archived_at);
  // Coches « lu » : membres invités seulement (les éditeurs qui voient tout ne comptent pas) ; sinon tous
  const memberIds = useMemo(() => {
    const invited = info.members.filter((m) => !m.implicit);
    return (invited.length > 0 ? invited : info.members).map((m) => m.id);
  }, [info.members]);
  const people: DirectoryPerson[] = useMemo(() => info.members.map((m) => ({ id: m.id, first_name: m.first_name, last_name: m.last_name, avatar_key: m.avatar_key, role: m.role, center: m.center, grouping: null, is_referent: false })), [info.members]);
  const positions = useMemo(() => bubblePositions(messages), [messages]);
  const pinned = info.pinned;
  // Séparateur « nouveaux messages » : premier message d'un autre postérieur à ma dernière lecture (à l'ouverture)
  const [firstUnreadId] = useState(() => (myLastReadAt ? initial.find((m) => m.created_at > myLastReadAt && m.author?.id !== me)?.id ?? null : null));

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const markRead = useCallback(() => {
    const last = [...messagesRef.current].reverse().find((m) => !m.pending);
    markChannelRead(info.id, last?.id ?? null).catch(() => {});
  }, [info.id]);

  // Position initiale : sur le séparateur « nouveaux messages » s'il existe, sinon en bas ; lecture marquée
  useEffect(() => {
    const el = scroller.current;
    const target = firstUnreadId ? document.getElementById(`msg-${firstUnreadId}`) : null;
    if (target && el) {
      target.scrollIntoView({ block: "start" });
      el.scrollTop -= 72;
    } else scrollToBottom();
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage
  }, []);

  /** Rattrapage : tout ce qui a bougé depuis le dernier horodatage connu. */
  const catchUp = useCallback(async () => {
    const since = lastStamp(messagesRef.current);
    const [changed, state] = await Promise.all([since ? fetchMessagesSince(info.id, since) : fetchMessages(info.id, null), fetchReadsState(info.id)]);
    setReads(state);
    if (changed.length === 0) return;
    const wasAtBottom = atBottomRef.current;
    const fresh = changed.filter((m) => !messagesRef.current.some((x) => x.id === m.id) && m.author?.id !== me);
    setMessages((prev) => mergeMessages(prev, changed));
    if (fresh.length > 0) {
      if (wasAtBottom && document.visibilityState === "visible") {
        setTimeout(() => scrollToBottom(true), 40);
        markRead();
      } else setNewCount((n) => n + fresh.length);
    }
  }, [info.id, me, scrollToBottom, markRead]);

  // ---- Temps réel ---------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let hadDisconnect = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const onInsert = async (id: string, authorId: string | null | undefined) => {
      const m = await fetchMessage(id);
      if (!m || !alive) return;
      const wasAtBottom = atBottomRef.current;
      setMessages((prev) => mergeMessages(prev, [m]));
      if (authorId === me) return;
      if (wasAtBottom && document.visibilityState === "visible") {
        setTimeout(() => scrollToBottom(true), 40);
        markRead();
      } else setNewCount((n) => n + 1);
      setTyping((t) => {
        const next = { ...t };
        if (authorId) delete next[authorId];
        return next;
      });
    };
    const onUpdate = async (id: string) => {
      const m = await fetchMessage(id);
      if (m && alive) setMessages((prev) => mergeMessages(prev, [m]));
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      // Le canal temps réel doit porter le jeton de session pour que la RLS laisse passer les événements
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`messages:${info.id}`, { config: { broadcast: { self: false } } })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "channel_messages", filter: `channel_id=eq.${info.id}` }, (p) => {
          const row = p.new as { id: string; author_id: string | null };
          void onInsert(row.id, row.author_id);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "channel_messages", filter: `channel_id=eq.${info.id}` }, (p) => void onUpdate((p.new as { id: string }).id))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "channel_messages", filter: `channel_id=eq.${info.id}` }, (p) => {
          const id = (p.old as { id?: string }).id;
          if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (p) => {
          const id = ((p.new as { message_id?: string }).message_id ?? (p.old as { message_id?: string }).message_id) as string | undefined;
          if (id && messagesRef.current.some((m) => m.id === id)) void onUpdate(id);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "channel_reads", filter: `channel_id=eq.${info.id}` }, (p) => {
          const row = p.new as { profile_id?: string; last_read_at?: string };
          if (row.profile_id && row.last_read_at) setReads((prev) => [...prev.filter((r) => r.profile_id !== row.profile_id), { profile_id: row.profile_id!, last_read_at: row.last_read_at! }]);
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const p = payload as { id: string; name: string };
          if (p.id === me) return;
          setTyping((t) => ({ ...t, [p.id]: { name: p.name, until: Date.now() + 4000 } }));
        })
        .subscribe((status) => {
          if (!alive) return;
          if (status === "SUBSCRIBED") {
            setConnected(true);
            if (hadDisconnect) void catchUp();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnected(false);
            hadDisconnect = true;
          }
        });
    })();

    // Filet : rattrapage au retour sur l'écran, au retour du réseau, et toutes les 30 s si le temps réel décroche
    const onVisible = () => document.visibilityState === "visible" && void catchUp().then(() => atBottomRef.current && markRead());
    const onOnline = () => void catchUp();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!connectedRef.current) void catchUp();
    }, 30_000);
    const typingTimer = setInterval(() => setTyping((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v.until > Date.now()))), 1000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(t);
      clearInterval(typingTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [info.id, me, catchUp, scrollToBottom, markRead]);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  // Clavier : le conteneur plein écran suit la fenêtre visuelle (iOS)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardInset(inset > 60 ? inset : 0);
      if (inset > 60 && atBottomRef.current) requestAnimationFrame(() => scrollToBottom());
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [scrollToBottom]);

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
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom && newCount > 0) {
      setNewCount(0);
      markRead();
    }
    if (el.scrollTop < 120) void loadMore();
  }

  function jumpToBottom() {
    scrollToBottom(true);
    setNewCount(0);
    markRead();
  }

  // ---- Envoi ------------------------------------------------------------------------
  async function deliver(tempId: string, payload: SendPayload & { client_id: string; reply_to_id: string | null }): Promise<boolean> {
    const r = await sendMessage({ channel_id: info.id, ...payload });
    if (!r.ok) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      return false;
    }
    payloads.current.delete(tempId);
    setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== tempId), [r.message]));
    return true;
  }

  async function send(payload: SendPayload): Promise<boolean> {
    const tempId = `tmp-${crypto.randomUUID()}`;
    const clientId = crypto.randomUUID();
    const full = { ...payload, client_id: clientId, reply_to_id: replyTo?.id ?? null };
    payloads.current.set(tempId, full);
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
      client_id: clientId,
      author: { id: me, first_name: "", last_name: "", avatar_key: null, role: "" },
      reply_to: replyTo ? { id: replyTo.id, type: replyTo.type, body: replyTo.body, author: replyTo.author ? `${replyTo.author.first_name} ${replyTo.author.last_name}` : "", has_media: Boolean(replyTo.media) } : null,
      reactions: [],
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setReplyTo(null);
    haptic();
    setTimeout(() => scrollToBottom(true), 30);
    // Hors ligne : texte gardé sur l'appareil (identifiant client), envoyé au retour du réseau
    if (!isOnline() && !payload.media && !payload.voice) {
      offlineQueue.enqueue({ kind: "message", client_id: clientId, channel_id: info.id, body: payload.body ?? null, reply_to_id: full.reply_to_id, mentions: payload.mentions, mention_all: payload.mention_all });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, queued: true } : m)));
      toast("Hors ligne : message envoyé dès le retour du réseau");
      return true;
    }
    const ok = await deliver(tempId, full);
    if (!ok) {
      // Une seconde tentative automatique après 3 s (même identifiant client : jamais en double)
      setTimeout(() => {
        const p = payloads.current.get(tempId);
        if (p) void deliver(tempId, p);
      }, 3000);
    }
    return true;
  }

  function retry(m: Message) {
    const p = payloads.current.get(m.id);
    if (!p) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)));
    void deliver(m.id, p).then((ok) => !ok && toast("Toujours impossible. Vérifiez le réseau."));
  }

  async function saveEdit(body: string): Promise<boolean> {
    if (!editing) return false;
    const r = await editMessage(editing.id, body);
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    setMessages((prev) => mergeMessages(prev, [r.message]));
    setEditing(null);
    return true;
  }

  // « X écrit… » : diffusion sans passer par la base (au plus une fois par 2 s)
  const lastTyping = useRef(0);
  const myName = useMemo(() => {
    const m = info.members.find((x) => x.id === me);
    return m ? `${m.first_name}`.trim() || "Quelqu'un" : "Quelqu'un";
  }, [info.members, me]);
  function onTyping() {
    const now = Date.now();
    if (now - lastTyping.current < 2000) return;
    lastTyping.current = now;
    const supabase = createClient();
    void supabase.channel(`messages:${info.id}`).send({ type: "broadcast", event: "typing", payload: { id: me, name: myName } });
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
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1600);
    } else toast("Message plus ancien : faites défiler vers le haut.");
  }

  const typingNames = Object.values(typing).map((t) => t.name);
  const membersLabel = info.type === "group" ? `${info.members.length} membre${info.members.length > 1 ? "s" : ""}` : info.subject ?? (info.type === "general" ? "Service communication et référents" : "Référents et service communication");
  const countdown = endsIn(info.ends_at);
  const subtitle = typingNames.length > 0 ? `${typingNames.slice(0, 2).join(", ")} ${typingNames.length > 1 ? "écrivent" : "écrit"}…` : readOnly ? "Lecture seule" : countdown ? `${membersLabel} · fin dans ${countdown}` : membersLabel;

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-bg-0" style={keyboardInset ? { bottom: keyboardInset } : undefined}>
      <TopBar
        leading={
          <Link href="/messages" className="pressable -ml-2 flex h-12 items-center gap-2 pr-2" aria-label="Retour aux messages">
            <ChevronLeft size={22} strokeWidth={1.75} className="text-text-2" />
            <AvatarMosaic photoKey={info.photo_key} people={info.members.slice(0, 4).map((m) => ({ name: `${m.first_name} ${m.last_name}`, avatar_key: m.avatar_key }))} size={32} />
            <span className="min-w-0 leading-tight">
              <span className="block max-w-[46vw] truncate text-[15px] font-semibold text-text-1">{info.name}</span>
              <span className={cn("block max-w-[46vw] truncate text-[11px]", typingNames.length > 0 ? "text-navy-link" : "text-text-3")} aria-live="polite">
                {subtitle}
              </span>
            </span>
          </Link>
        }
        right={
          <Link href={`/messages/${info.id}/infos`} aria-label="Informations" className="pressable flex h-10 w-10 items-center justify-center text-text-2">
            <Info size={22} strokeWidth={1.75} />
          </Link>
        }
      />

      <div ref={scroller} onScroll={onScroll} className="relative flex-1 overflow-y-auto pb-3 pt-[calc(48px+env(safe-area-inset-top)+8px)] [overflow-anchor:none]">
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
        {!connected && (
          <p className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-full bg-bg-1 px-3 py-1.5 text-[12px] text-text-2" role="status">
            <WifiOff size={14} strokeWidth={1.75} aria-hidden="true" /> Reconnexion… les messages seront rattrapés
          </p>
        )}
        {loadingMore && <p className="py-2 text-center text-[12px] text-text-3">Chargement…</p>}
        {messages.length === 0 && <p className="px-6 py-10 text-center text-[15px] text-text-2">{info.type === "group" ? `Groupe créé pour : ${info.subject}` : "Aucun message pour le moment."}</p>}
        {messages.map((m, i) => {
          const mine = m.author?.id === me;
          const receipt = mine && !m.pending && !m.failed ? readReceipt(m, reads, memberIds, me) : null;
          return (
            <div key={m.id}>
              {needsDateSeparator(messages, i) && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-bg-1 px-3 py-1 text-[12px] text-text-3">{dateLabel(m.created_at)}</span>
                </div>
              )}
              {m.id === firstUnreadId && (
                <div className="my-2 flex items-center gap-3 px-4" aria-label="Nouveaux messages">
                  <span className="h-px flex-1 bg-red/40" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-text">Nouveaux messages</span>
                  <span className="h-px flex-1 bg-red/40" />
                </div>
              )}
              <MessageBubble
                m={m}
                mine={mine}
                pos={positions[m.id] ?? "single"}
                showName={info.type !== "general" || true}
                receipt={receipt}
                onLongPress={(msg) => !msg.pending && !msg.failed && setActionsFor(msg)}
                onOpenMedia={openMedia}
                onJumpTo={jumpTo}
                onReply={(msg) => !msg.deleted_at && setReplyTo(msg)}
                onRetry={retry}
              />
            </div>
          );
        })}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label={newCount > 0 ? `${newCount} nouveau${newCount > 1 ? "x" : ""} message${newCount > 1 ? "s" : ""}, aller en bas` : "Aller en bas"}
          className="glass-float pressable absolute bottom-[calc(max(env(safe-area-inset-bottom),8px)+84px)] right-4 z-10 flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-text-1"
        >
          <ArrowDown size={16} strokeWidth={2} aria-hidden="true" />
          {newCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1.5 text-[11px] text-white">{newCount}</span>}
        </button>
      )}

      <div className={cn("shrink-0 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1")}>
        {readOnly ? (
          <p className="rounded-[16px] bg-bg-1 px-4 py-3 text-center text-[13px] text-text-2">{info.archived_at ? "Groupe archivé : lecture seule." : "Conversation en lecture seule."}</p>
        ) : (
          <Composer channelId={info.id} people={people} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} editing={editing} onCancelEdit={() => setEditing(null)} onEdit={saveEdit} onSend={send} onTyping={onTyping} mediaAllowed={isEditor || info.members_can_post_media} />
        )}
      </div>

      <MessageActions m={actionsFor} mine={actionsFor?.author?.id === me} isEditor={isEditor} onClose={() => setActionsFor(null)} onReply={setReplyTo} onEdit={setEditing} onChanged={() => void catchUp()} />
      {lightbox && <Lightbox open items={lightbox.items} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}

export type { SendPayload, MessageMedia, MessageVoice };
