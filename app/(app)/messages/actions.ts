"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { MESSAGE_LIMITS } from "@/lib/messages/helpers";
import { MESSAGE_EMOJIS, type ChannelInfo, type Conversation, type DirectoryPerson, type Message, type MessageMedia, type MessageVoice, type SeenBy } from "@/lib/messages/types";
import { after } from "next/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function friendly(message: string | undefined): string {
  if (!message) return "Une erreur est survenue.";
  if (message.includes("DELAI_DEPASSE")) return "Un message ne peut être supprimé que dans les 15 minutes.";
  if (message.includes("ACCES_REFUSE") || message.includes("row-level security")) return "Action non autorisée.";
  return friendlyDbError(message);
}

const uuid = z.uuid();

// ---- Lecture ----------------------------------------------------------------

export async function listConversations(): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_conversations");
  if (error) return [];
  return (data ?? []) as unknown as Conversation[];
}

export async function getMessagingUnread(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("messaging_unread_total");
  return (data as number | null) ?? 0;
}

export async function fetchMessages(channelId: string, before: string | null = null): Promise<Message[]> {
  if (!uuid.safeParse(channelId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("channel_messages_page", { p_channel: channelId, p_before: before, p_limit: 40 });
  if (error) return [];
  return ((data ?? []) as unknown as Message[]).reverse();
}

export async function fetchChannelInfo(channelId: string): Promise<ChannelInfo | null> {
  if (!uuid.safeParse(channelId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("channel_info", { p_channel: channelId });
  if (error || !data) return null;
  return data as unknown as ChannelInfo;
}

export async function markChannelRead(channelId: string, messageId: string | null = null): Promise<void> {
  if (!uuid.safeParse(channelId).success) return;
  const supabase = await createClient();
  await supabase.rpc("mark_channel_read", { p_channel: channelId, p_message_id: messageId });
}

export async function messageSeenBy(messageId: string): Promise<SeenBy> {
  if (!uuid.safeParse(messageId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("message_seen_by", { p_message_id: messageId });
  return ((data ?? []) as unknown as SeenBy) ?? [];
}

export async function searchChannel(channelId: string, q: string): Promise<Message[]> {
  const t = q.trim();
  if (!uuid.safeParse(channelId).success || t.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_channel", { p_channel: channelId, p_q: t, p_limit: 30 });
  return (data ?? []) as unknown as Message[];
}

export async function messagingDirectory(q: string | null = null): Promise<DirectoryPerson[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("messaging_directory", { p_q: q });
  return (data ?? []) as unknown as DirectoryPerson[];
}

// ---- Envoi -------------------------------------------------------------------

const mediaSchema = z.object({
  key: z.string().min(1).max(300),
  kind: z.enum(["image", "video", "file"]),
  mime: z.string().max(100),
  name: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  poster_key: z.string().max(300).nullable().optional(),
  duration_s: z.number().nonnegative().nullable().optional(),
});
const voiceSchema = z.object({ key: z.string().min(1).max(300), mime: z.string().max(100), duration_s: z.number().positive().max(MESSAGE_LIMITS.voiceMaxSeconds + 5), waveform: z.array(z.number().min(0).max(1)).max(64) });
const sendSchema = z.object({
  channel_id: uuid,
  body: z.string().trim().max(MESSAGE_LIMITS.bodyMax).optional(),
  media: z.array(mediaSchema).max(MESSAGE_LIMITS.imagesPerMessage).optional(),
  voice: voiceSchema.optional(),
  reply_to_id: uuid.nullable().optional(),
  mentions: z.array(uuid).max(50).optional(),
  mention_all: z.boolean().optional(),
});

/** Envoie un message (texte, médias ou vocal) ; la push est distribuée juste après. */
export async function sendMessage(input: { channel_id: string; body?: string; media?: MessageMedia[]; voice?: MessageVoice; reply_to_id?: string | null; mentions?: string[]; mention_all?: boolean }): Promise<Result<{ message: Message }>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Message invalide." };
  const v = parsed.data;
  const body = v.body || null;
  const media = v.media && v.media.length ? v.media : null;
  const voice = v.voice ?? null;
  if (!body && !media && !voice) return { ok: false, error: "Message vide." };
  if (media && media.filter((m) => m.kind === "image").length > MESSAGE_LIMITS.imagesPerMessage) return { ok: false, error: `${MESSAGE_LIMITS.imagesPerMessage} photos au plus.` };
  if (media && media.filter((m) => m.kind !== "image").length > 1) return { ok: false, error: "Une seule vidéo ou un seul fichier par message." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const type = voice ? "voice" : media ? "media" : "text";
  const { data, error } = await supabase
    .from("channel_messages")
    .insert({ channel_id: v.channel_id, author_id: user.id, type, body, media: media as unknown as import("@/lib/supabase/database.types").Json, voice: voice as unknown as import("@/lib/supabase/database.types").Json, reply_to_id: v.reply_to_id ?? null, mentions: v.mentions ?? [], mention_all: v.mention_all ?? false })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[messages] envoi refusé", error?.message, JSON.stringify({ mentions: v.mentions, mention_all: v.mention_all }));
    return { ok: false, error: friendly(error?.message) };
  }
  const { data: full } = await supabase.rpc("channel_messages_page", { p_channel: v.channel_id, p_before: null, p_limit: 1 });
  const message = ((full ?? []) as unknown as Message[]).find((m) => m.id === data.id) ?? ((full ?? []) as unknown as Message[])[0];
  await supabase.rpc("mark_channel_read", { p_channel: v.channel_id, p_message_id: data.id });
  after(async () => {
    await dispatchNotifications(5).catch((e) => console.error("push messagerie", e));
  });
  return { ok: true, message };
}

export async function setMessageReaction(messageId: string, emoji: string | null): Promise<Result> {
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Identifiant invalide." };
  if (emoji !== null && !(MESSAGE_EMOJIS as readonly string[]).includes(emoji)) return { ok: false, error: "Réaction inconnue." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = emoji === null
    ? await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("profile_id", user.id)
    : await supabase.from("message_reactions").upsert({ message_id: messageId, profile_id: user.id, emoji }, { onConflict: "message_id,profile_id" });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}

export async function deleteMessage(messageId: string): Promise<Result> {
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("channel_messages").update({ deleted_at: new Date().toISOString(), pinned_at: null }).eq("id", messageId);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}

export async function pinMessage(messageId: string, pinned: boolean): Promise<Result> {
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  if (pinned) {
    const { data: row } = await supabase.from("channel_messages").select("channel_id").eq("id", messageId).maybeSingle();
    if (!row) return { ok: false, error: "Message introuvable." };
    const { count } = await supabase.from("channel_messages").select("id", { count: "exact", head: true }).eq("channel_id", row.channel_id).not("pinned_at", "is", null);
    if ((count ?? 0) >= MESSAGE_LIMITS.pinnedMax) return { ok: false, error: `${MESSAGE_LIMITS.pinnedMax} messages épinglés au plus : désépinglez-en un d'abord.` };
  }
  const { error } = await supabase.from("channel_messages").update({ pinned_at: pinned ? new Date().toISOString() : null }).eq("id", messageId);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}

export async function forwardMessage(messageId: string, toChannelId: string): Promise<Result> {
  if (!uuid.safeParse(messageId).success || !uuid.safeParse(toChannelId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("forward_message", { p_message: messageId, p_to_channel: toChannelId });
  if (error) return { ok: false, error: friendly(error.message) };
  after(async () => {
    await dispatchNotifications(5).catch(() => {});
  });
  return { ok: true };
}

export async function exportChannel(channelId: string): Promise<Result<{ text: string }>> {
  if (!uuid.safeParse(channelId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_channel", { p_channel: channelId });
  if (error) return { ok: false, error: friendly(error.message) };
  if (data === null) return { ok: false, error: "Export réservé au service communication." };
  return { ok: true, text: (data as string) ?? "" };
}

const prefsSchema = z.object({
  notifications: z.enum(["all", "mentions", "none"]).optional(),
  pinned: z.boolean().optional(),
  mute_hours: z.number().int().min(0).max(24 * 365).nullable().optional(),
  hidden: z.boolean().optional(),
});

/** Préférences par conversation : notifications, épingle, silence (h, 0 = lever), masquer. */
export async function setChannelPrefs(channelId: string, prefs: { notifications?: "all" | "mentions" | "none"; pinned?: boolean; mute_hours?: number | null; hidden?: boolean }): Promise<Result> {
  const parsed = prefsSchema.safeParse(prefs);
  if (!uuid.safeParse(channelId).success || !parsed.success) return { ok: false, error: "Valeur invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_channel_prefs", {
    p_channel: channelId,
    p_notifications: p.notifications ?? null,
    p_pinned: p.pinned ?? null,
    p_muted_until: p.mute_hours ? new Date(Date.now() + p.mute_hours * 3_600_000).toISOString() : null,
    p_clear_mute: p.mute_hours === 0,
    p_hidden: p.hidden ?? null,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/messages");
  return { ok: true };
}

// ---- Groupes (éditeurs) --------------------------------------------------------

const groupSchema = z.object({
  name: z.string().trim().min(1, "Donnez un nom au groupe.").max(MESSAGE_LIMITS.groupNameMax, `${MESSAGE_LIMITS.groupNameMax} caractères maximum.`),
  subject: z.string().trim().min(1, "Précisez l'objet du groupe.").max(MESSAGE_LIMITS.subjectMax, `${MESSAGE_LIMITS.subjectMax} caractères maximum.`),
  photo_key: z.string().max(300).nullable().optional(),
  ends_at: z.string().nullable().optional(),
  members_can_post_media: z.boolean().optional(),
  member_ids: z.array(uuid).min(1, "Ajoutez au moins une personne.").max(200),
});

export async function createGroup(input: { name: string; subject: string; photo_key?: string | null; ends_at?: string | null; members_can_post_media?: boolean; member_ids: string[] }): Promise<Result<{ id: string }>> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Groupe invalide." };
  const v = parsed.data;
  const endsAt = v.ends_at ? new Date(v.ends_at) : null;
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt.getTime() < Date.now() + 3_600_000)) return { ok: false, error: "La date de fin doit être dans le futur." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: channel, error } = await supabase
    .from("channels")
    .insert({ type: "group", name: v.name, subject: v.subject, photo_key: v.photo_key ?? null, ends_at: endsAt?.toISOString() ?? null, members_can_post_media: v.members_can_post_media ?? true, created_by: user.id })
    .select("id")
    .single();
  if (error || !channel) return { ok: false, error: friendly(error?.message) };
  const ids = [...new Set([user.id, ...v.member_ids])];
  const { error: mErr } = await supabase.from("channel_members").insert(ids.map((id) => ({ channel_id: channel.id, profile_id: id, added_by: id === user.id ? null : user.id, role: id === user.id ? "admin" : "member" })));
  if (mErr) return { ok: false, error: friendly(mErr.message) };
  revalidatePath("/messages");
  return { ok: true, id: channel.id };
}

const updateSchema = groupSchema.omit({ member_ids: true }).partial();

export async function updateGroup(channelId: string, input: { name?: string; subject?: string; photo_key?: string | null; ends_at?: string | null; members_can_post_media?: boolean }): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!uuid.safeParse(channelId).success || !parsed.success) return { ok: false, error: parsed.success ? "Identifiant invalide." : (parsed.error.issues[0]?.message ?? "Valeur invalide.") };
  const v = parsed.data;
  const patch: import("@/lib/supabase/database.types").Database["public"]["Tables"]["channels"]["Update"] = {};
  if (v.name !== undefined) patch.name = v.name;
  if (v.subject !== undefined) patch.subject = v.subject;
  if (v.photo_key !== undefined) patch.photo_key = v.photo_key;
  if (v.members_can_post_media !== undefined) patch.members_can_post_media = v.members_can_post_media;
  if (v.ends_at !== undefined) {
    const d = v.ends_at ? new Date(v.ends_at) : null;
    if (d && Number.isNaN(d.getTime())) return { ok: false, error: "Date invalide." };
    patch.ends_at = d?.toISOString() ?? null;
    patch.reminded_at = null;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("channels").update(patch).eq("id", channelId).eq("type", "group");
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/messages");
  return { ok: true };
}

export async function addMembers(channelId: string, memberIds: string[]): Promise<Result> {
  if (!uuid.safeParse(channelId).success || memberIds.some((id) => !uuid.safeParse(id).success) || memberIds.length === 0) return { ok: false, error: "Liste invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  // Anciens membres réintégrés (left_at levé), nouveaux insérés
  const { data: existing } = await supabase.from("channel_members").select("profile_id, left_at").eq("channel_id", channelId).in("profile_id", memberIds);
  const back = (existing ?? []).filter((m) => m.left_at).map((m) => m.profile_id);
  const fresh = memberIds.filter((id) => !(existing ?? []).some((m) => m.profile_id === id));
  if (back.length) await supabase.from("channel_members").update({ left_at: null, added_by: user.id, added_at: new Date().toISOString() }).eq("channel_id", channelId).in("profile_id", back);
  if (fresh.length) {
    const { error } = await supabase.from("channel_members").insert(fresh.map((id) => ({ channel_id: channelId, profile_id: id, added_by: user.id, role: "member" as const })));
    if (error) return { ok: false, error: friendly(error.message) };
  }
  revalidatePath(`/messages/${channelId}`);
  return { ok: true };
}

export async function removeMember(channelId: string, memberId: string): Promise<Result> {
  if (!uuid.safeParse(channelId).success || !uuid.safeParse(memberId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("channel_members").delete().eq("channel_id", channelId).eq("profile_id", memberId);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath(`/messages/${channelId}`);
  return { ok: true };
}

export async function leaveGroup(channelId: string): Promise<Result> {
  if (!uuid.safeParse(channelId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("channel_members").update({ left_at: new Date().toISOString() }).eq("channel_id", channelId).eq("profile_id", user.id);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/messages");
  return { ok: true };
}

export async function archiveGroup(channelId: string, archived: boolean): Promise<Result> {
  if (!uuid.safeParse(channelId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("channels")
    .update(archived ? { archived_at: new Date().toISOString(), read_only: true } : { archived_at: null, read_only: false })
    .eq("id", channelId)
    .eq("type", "group");
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/messages");
  return { ok: true };
}
