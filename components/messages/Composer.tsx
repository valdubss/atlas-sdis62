"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Mic, Plus, Send, Square, Video, X } from "lucide-react";
import type { DirectoryPerson, Message, MessageMedia, MessageVoice } from "@/lib/messages/types";
import { FILE_MIMES, MESSAGE_LIMITS, mentionQuery, normalizeWaveform, parseMentions, formatDuration } from "@/lib/messages/helpers";
import { signMessageUpload } from "@/app/(app)/messages/media-actions";
import { prepareFile, uploadWithProgress } from "@/lib/media/client";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";

type Draft = { id: string; kind: "image" | "video" | "file"; name: string; preview?: string; progress: number; media?: MessageMedia; error?: string };

/**
 * Composeur en verre : « + » (photos, vidéo, fichier), champ multi-lignes
 * (5 lignes max), mentions « @ », micro (maintenir pour enregistrer, glisser
 * vers le haut pour verrouiller) ou envoi.
 */
export function Composer({
  channelId,
  people,
  replyTo,
  onCancelReply,
  onSend,
  disabled,
  mediaAllowed,
}: {
  channelId: string;
  people: DirectoryPerson[];
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (payload: { body?: string; media?: MessageMedia[]; voice?: MessageVoice; mentions: string[]; mention_all: boolean }) => Promise<boolean>;
  disabled?: boolean;
  mediaAllowed: boolean;
}) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [menu, setMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const [caret, setCaret] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  // Enregistrement vocal
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startY = useRef(0);
  const cancelled = useRef(false);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22 + 16)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  const query = mentionQuery(text, caret);
  const suggestions = query !== null ? [{ id: "all", first_name: "tous", last_name: "", avatar_key: null, role: "", center: null, grouping: null, is_referent: false } as DirectoryPerson, ...people.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(query.toLowerCase()))].slice(0, 6) : [];

  function insertMention(p: DirectoryPerson) {
    const before = text.slice(0, caret).replace(/@[^\s@]*$/, "");
    const label = p.id === "all" ? "@tous " : `@${p.first_name} ${p.last_name} `;
    const next = before + label + text.slice(caret);
    setText(next);
    setCaret(before.length + label.length);
    setTimeout(() => textarea.current?.focus(), 0);
  }

  async function addFiles(files: FileList | null, kind: "image" | "video" | "file") {
    if (!files) return;
    setMenu(false);
    const list = Array.from(files);
    if (kind === "image" && drafts.filter((d) => d.kind === "image").length + list.length > MESSAGE_LIMITS.imagesPerMessage) {
      toast(`${MESSAGE_LIMITS.imagesPerMessage} photos au plus par message.`);
      return;
    }
    for (const file of list) {
      const id = crypto.randomUUID();
      setDrafts((prev) => [...prev, { id, kind, name: file.name, progress: 0 }]);
      try {
        let blob: Blob = file;
        let mime = file.type;
        let width: number | null = null;
        let height: number | null = null;
        let duration: number | null = null;
        let poster: Blob | undefined;
        if (kind !== "file") {
          const prepared = await prepareFile(file, { maxDurationS: MESSAGE_LIMITS.videoMaxSeconds });
          blob = prepared.blob;
          mime = prepared.mime;
          width = prepared.width;
          height = prepared.height;
          duration = prepared.duration ?? null;
          poster = prepared.poster;
          if (kind === "image") setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, preview: URL.createObjectURL(blob) } : d)));
        } else if (!(FILE_MIMES as readonly string[]).includes(mime)) throw new Error("PDF ou Word seulement.");
        const signed = await signMessageUpload({ channel_id: channelId, kind, mime, size: blob.size, name: file.name });
        if (!signed.ok) throw new Error(signed.error);
        await uploadWithProgress(signed.url, signed.headers, blob, (f) => setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, progress: f } : d))));
        let posterKey: string | null = null;
        if (poster) {
          const ps = await signMessageUpload({ channel_id: channelId, kind: "image", mime: "image/jpeg", size: poster.size, name: "poster.jpg" });
          if (ps.ok) {
            await uploadWithProgress(ps.url, ps.headers, poster, () => {});
            posterKey = ps.key;
          }
        }
        const media: MessageMedia = { key: signed.key, kind, mime, name: file.name, size: blob.size, width, height, poster_key: posterKey, duration_s: duration };
        setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, progress: 1, media } : d)));
      } catch (e) {
        setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, error: e instanceof Error ? e.message : "Envoi impossible" } : d)));
      }
    }
  }

  async function submit() {
    const body = text.trim();
    const media = drafts.filter((d) => d.media).map((d) => d.media!);
    if (!body && media.length === 0) return;
    if (drafts.some((d) => !d.media && !d.error)) {
      toast("Attendez la fin de l'envoi des pièces jointes.");
      return;
    }
    setSending(true);
    const { mentions, mentionAll } = parseMentions(body, people);
    const ok = await onSend({ body: body || undefined, media: media.length ? media : undefined, mentions, mention_all: mentionAll });
    setSending(false);
    if (ok) {
      setText("");
      setDrafts([]);
      onCancelReply();
    }
  }

  // ---- Vocal ---------------------------------------------------------------
  async function startRecording(e: React.PointerEvent) {
    if (disabled) return;
    startY.current = e.clientY;
    cancelled.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (ev) => ev.data.size > 0 && chunks.current.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelled.current) void finishVoice(new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" }));
      };
      rec.start(250);
      recorder.current = rec;
      setRecording(true);
      setSeconds(0);
      haptic();
    } catch {
      toast("Micro indisponible.");
    }
  }
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= MESSAGE_LIMITS.voiceMaxSeconds) stopRecording(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrêt à la limite
  }, [seconds]);
  function stopRecording(cancel: boolean) {
    cancelled.current = cancel;
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
    setLocked(false);
  }
  function onRecordMove(e: React.PointerEvent) {
    if (!recording || locked) return;
    if (startY.current - e.clientY > 60) {
      setLocked(true);
      haptic();
    }
  }
  function onRecordUp() {
    if (!recording || locked) return;
    stopRecording(seconds < 1);
  }
  async function finishVoice(blob: Blob) {
    const duration = seconds;
    if (duration < 1 || blob.size === 0) return;
    setSending(true);
    try {
      let waveform: number[] = [];
      try {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        waveform = normalizeWaveform(buf.getChannelData(0));
        await ctx.close();
      } catch {
        waveform = Array(64).fill(0.4);
      }
      const signed = await signMessageUpload({ channel_id: channelId, kind: "voice", mime: blob.type || "audio/webm", size: blob.size, name: "vocal" });
      if (!signed.ok) throw new Error(signed.error);
      await uploadWithProgress(signed.url, signed.headers, blob, () => {});
      const ok = await onSend({ voice: { key: signed.key, mime: blob.type || "audio/webm", duration_s: duration, waveform }, mentions: [], mention_all: false });
      if (ok) onCancelReply();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Envoi du vocal impossible.");
    } finally {
      setSending(false);
    }
  }

  const canSend = (text.trim().length > 0 || drafts.some((d) => d.media)) && !sending;

  return (
    <div className="glass rounded-[22px] px-2 pb-2 pt-1.5">
      {replyTo && (
        <div className="mb-1.5 flex items-center gap-2 rounded-[12px] bg-bg-1 px-3 py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-navy-link">Répondre à {replyTo.author ? replyTo.author.first_name : "Agent"}</span>
            <span className="block truncate text-[13px] text-text-2">{replyTo.body ?? (replyTo.type === "voice" ? "Message vocal" : "Photo ou fichier")}</span>
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Annuler la réponse" className="flex h-8 w-8 items-center justify-center text-text-3">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}
      {drafts.length > 0 && (
        <div className="no-scrollbar mb-1.5 flex gap-2 overflow-x-auto px-1" aria-label="Pièces jointes">
          {drafts.map((d) => (
            <span key={d.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-bg-1">
              {d.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local
                <img src={d.preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-text-3">{d.kind === "video" ? <Video size={20} strokeWidth={1.75} /> : <FileText size={20} strokeWidth={1.75} />}</span>
              )}
              {!d.media && !d.error && <span className="absolute inset-x-0 bottom-0 h-1 bg-text-1" style={{ width: `${Math.round(d.progress * 100)}%` }} />}
              {d.error && <span className="absolute inset-0 flex items-center justify-center bg-red/70 p-1 text-center text-[10px] text-white">{d.error}</span>}
              <button type="button" onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))} aria-label="Retirer" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <ul className="mb-1.5 max-h-40 overflow-y-auto rounded-[12px] bg-bg-1" role="listbox" aria-label="Mentionner">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => insertMention(p)} className="flex h-10 w-full items-center px-3 text-left text-[14px] text-text-1 hover:bg-bg-2">
                @{p.first_name} {p.last_name}
                {p.id === "all" && <span className="ml-2 text-[12px] text-text-3">tout le monde</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {recording ? (
        <div className="flex h-11 items-center gap-3 px-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red" aria-hidden="true" />
          <span className="text-[15px] tabular-nums text-text-1">{formatDuration(seconds)}</span>
          <span className="flex-1 text-[13px] text-text-3">{locked ? "Enregistrement verrouillé" : "Relâchez pour envoyer · glissez vers le haut pour verrouiller"}</span>
          {locked ? (
            <>
              <button type="button" onClick={() => stopRecording(true)} className="text-[13px] font-medium text-text-2">
                Annuler
              </button>
              <button type="button" onClick={() => stopRecording(false)} aria-label="Envoyer le vocal" className="flex h-9 w-9 items-center justify-center rounded-full bg-text-1 text-bg-0">
                <Square size={14} strokeWidth={2} fill="currentColor" />
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex items-end gap-1">
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} disabled={disabled || !mediaAllowed} aria-label="Joindre" aria-expanded={menu} className="flex h-11 w-11 items-center justify-center rounded-full text-text-2 disabled:opacity-40">
              <Plus size={22} strokeWidth={1.75} className={cn("transition-transform", menu && "rotate-45")} />
            </button>
            {menu && (
              <div className="absolute bottom-12 left-0 z-10 w-48 rounded-[14px] bg-bg-1 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.35)]" role="menu">
                <label className="flex h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[15px] text-text-1 hover:bg-bg-2">
                  <ImageIcon size={18} strokeWidth={1.75} /> Photos
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files, "image")} />
                </label>
                <label className="flex h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[15px] text-text-1 hover:bg-bg-2">
                  <Video size={18} strokeWidth={1.75} /> Vidéo (60 s)
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => addFiles(e.target.files, "video")} />
                </label>
                <label className="flex h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[15px] text-text-1 hover:bg-bg-2">
                  <FileText size={18} strokeWidth={1.75} /> Fichier (PDF, Word)
                  <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => addFiles(e.target.files, "file")} />
                </label>
              </div>
            )}
          </div>
          <textarea
            ref={textarea}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            maxLength={MESSAGE_LIMITS.bodyMax}
            placeholder={disabled ? "Lecture seule" : "Message"}
            aria-label="Message"
            enterKeyHint="send"
            className="min-h-11 flex-1 resize-none bg-transparent px-2 py-[11px] text-[16px] leading-[22px] text-text-1 outline-none placeholder:text-text-3"
          />
          {canSend ? (
            <button type="button" onClick={() => void submit()} aria-label="Envoyer" className="flex h-11 w-11 items-center justify-center rounded-full text-text-1">
              <Send size={22} strokeWidth={1.75} />
            </button>
          ) : (
            <button type="button" disabled={disabled || sending} onPointerDown={startRecording} onPointerMove={onRecordMove} onPointerUp={onRecordUp} onPointerCancel={onRecordUp} aria-label="Maintenir pour enregistrer un vocal" className="flex h-11 w-11 touch-none items-center justify-center rounded-full text-text-2 disabled:opacity-40">
              <Mic size={22} strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
