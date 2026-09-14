import type { ReactionKind } from "@/lib/config";
import type { AuthorDisplay, PostStatus, PostType } from "@/lib/supabase/database.types";

export type MediaItem = {
  id: string;
  kind: "image" | "video";
  variants: { thumb?: string; small?: string; medium?: string; full?: string };
  poster_key: string | null;
  width: number | null;
  height: number | null;
  alt: string;
  mime: string;
  original_key: string;
  duration_s?: number | null;
  position?: number;
  /** Aperçu studio : URL locale (blob:) avant/pendant l'upload. */
  preview_url?: string;
  poster_preview_url?: string;
};

export type PollOption = { id: string; label: string; position: number; votes: number };

export type Poll = {
  question: string;
  closes_at: string | null;
  total_votes: number;
  my_option_id: string | null;
  options: PollOption[];
};

export type ReactionCounts = Partial<Record<ReactionKind, number>>;

/** Forme unique d'un post, produite par la fonction SQL post_to_json(). */
export type FeedPost = {
  id: string;
  type: PostType;
  slug: string;
  title: string | null;
  location: string | null;
  excerpt: string | null;
  body: string | null;
  tags: string[];
  status: PostStatus;
  published_at: string | null;
  scheduled_at: string | null;
  pinned_at: string | null;
  comments_enabled: boolean;
  author_display: AuthorDisplay;
  category: { id: string; name: string; slug: string } | null;
  center: { id: string; name: string; slug: string } | null;
  author: { name: string; avatar_key: string | null } | null;
  cover: MediaItem | null;
  media: MediaItem[];
  poll: Poll | null;
  reaction_counts: ReactionCounts;
  comment_count: number;
  my_reaction: ReactionKind | null;
  is_bookmarked: boolean;
};

export type CommentItem = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  status: "visible" | "hidden" | "deleted";
  created_at: string;
  edited_at: string | null;
  is_mine: boolean;
  author: { name: string | null; center: string | null; avatar_key: string | null };
};

export type FeedParams = {
  category?: string | null;
  center?: string | null;
  q?: string | null;
  tag?: string | null;
  bookmarked?: boolean;
};

export type FeedCursor = { at: string; id: string } | null;

export function cursorOf(posts: FeedPost[]): FeedCursor {
  const last = posts[posts.length - 1];
  return last?.published_at ? { at: last.published_at, id: last.id } : null;
}

/** Story sérialisée par story_to_json(). */
export type StoryOverlay = { text?: string; position?: "top" | "middle" | "bottom" } | null;

export type StoryItem = {
  id: string;
  series_id: string;
  series_title: string | null;
  status: "draft" | "scheduled" | "published" | "expired" | "archived";
  overlay: StoryOverlay;
  display_seconds: number;
  scheduled_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  position: number;
  media: MediaItem | null;
  link_post: { id: string; slug: string; title: string | null } | null;
  seen: boolean;
  views: number;
};

/** Bulle du bandeau : une série active ou un à-la-une. */
export type StoryGroup = {
  id: string;
  kind: "series" | "highlight";
  title: string;
  count: number;
  all_seen: boolean;
  latest_at: string | null;
  cover: MediaItem | null;
};

export type StoryBar = { series: StoryGroup[]; highlights: StoryGroup[] };
