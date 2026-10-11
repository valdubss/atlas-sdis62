import type { MediaItem } from "@/lib/feed/types";

export type LiveStatus = "draft" | "live" | "ended";

export type LiveItem = {
  id: string;
  title: string;
  location: string | null;
  status: LiveStatus;
  video: boolean;
  started_at: string | null;
  ended_at: string | null;
  recap_post_id: string | null;
  created_at: string;
  center: { id: string; name: string; slug: string } | null;
  recap_slug?: string | null;
};

export type LiveEntry = {
  id: string;
  live_id: string;
  body: string | null;
  pinned: boolean;
  created_at: string;
  author: { name: string | null } | null;
  media: MediaItem | null;
};

export const LIVE_LIMITS = { titleMax: 120, locationMax: 160, entryMax: 600 } as const;

/** Adresse HLS publique du canal de direct (Bunny Stream), connue du navigateur. */
export const LIVE_HLS_URL = process.env.NEXT_PUBLIC_LIVE_HLS_URL ?? "";
