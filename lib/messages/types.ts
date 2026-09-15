/** Types de la messagerie de travail (lot 6 v3), miroir des RPC SQL. */

export type ChannelType = "general" | "grouping" | "center" | "group";
export type MessageType = "text" | "media" | "system" | "voice";
export type ChannelNotif = "all" | "mentions" | "none";

export const MESSAGE_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;
export type MessageEmoji = (typeof MESSAGE_EMOJIS)[number];

/** Pièce jointe d'un message : image, vidéo courte ou fichier (PDF / docx). */
export type MessageMedia = {
  key: string;
  kind: "image" | "video" | "file";
  mime: string;
  name?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  poster_key?: string | null;
  duration_s?: number | null;
};

export type MessageVoice = { key: string; mime: string; duration_s: number; waveform: number[]; transcript?: string | null };

export type MessageAuthor = { id: string; first_name: string; last_name: string; avatar_key: string | null; role: string };

export type MessageReaction = { emoji: MessageEmoji; count: number; mine: boolean };

export type Message = {
  id: string;
  channel_id: string;
  type: MessageType;
  body: string | null;
  media: MessageMedia[] | null;
  voice: MessageVoice | null;
  mentions: string[];
  mention_all: boolean;
  pinned_at: string | null;
  deleted_at: string | null;
  created_at: string;
  author: MessageAuthor | null;
  reply_to: { id: string; type: MessageType; body: string | null; author: string; has_media: boolean } | null;
  reactions: MessageReaction[];
  /** Local : envoi en cours / échec (jamais renvoyé par le serveur) */
  pending?: boolean;
  failed?: boolean;
};

export type Conversation = {
  id: string;
  type: ChannelType;
  name: string;
  subject: string | null;
  photo_key: string | null;
  ends_at: string | null;
  read_only: boolean;
  archived_at: string | null;
  last_message_at: string | null;
  members_can_post_media: boolean;
  created_by: string | null;
  pinned: boolean | null;
  muted_until: string | null;
  notifications: ChannelNotif | null;
  hidden_until: string | null;
  unread: number;
  mentioned: boolean;
  last_message: { type: MessageType; body: string; author: string | null; created_at: string } | null;
  member_count: number;
  avatars: { name: string; avatar_key: string | null }[];
};

export type ChannelMember = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_key: string | null;
  job_title: string | null;
  center: string | null;
  role: "admin" | "member";
};

export type ChannelInfo = {
  id: string;
  type: ChannelType;
  name: string;
  subject: string | null;
  photo_key: string | null;
  ends_at: string | null;
  read_only: boolean;
  archived_at: string | null;
  members_can_post_media: boolean;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  me: { role: "admin" | "member"; notifications: ChannelNotif; pinned: boolean; muted_until: string | null } | null;
  members: ChannelMember[];
  pinned: Message[];
  media_count: number;
};

export type DirectoryPerson = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_key: string | null;
  role: string;
  center: string | null;
  grouping: string | null;
  is_referent: boolean;
};

export type SeenBy = { id: string; name: string; avatar_key: string | null; at: string }[];
