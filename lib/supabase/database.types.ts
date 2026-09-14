/**
 * Types de la base Supabase.
 *
 * Écrit à la main (tables et fonctions utilisées par l'application). Une fois le
 * projet Supabase lié à la CLI, il se régénère avec :
 *
 *   npm run db:types
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "editor" | "reader";
export type PostType = "photo" | "video" | "article" | "text" | "poll";
export type PostStatus = "draft" | "scheduled" | "published" | "archived";
export type AuthorDisplay = "service_com" | "agent";
export type MediaKind = "image" | "video";
export type MediaStatus = "uploading" | "processing" | "ready" | "failed";
export type ReactionKindDb = "clap" | "fire" | "heart" | "muscle";
export type CommentStatus = "visible" | "hidden" | "deleted";
export type ReportStatus = "open" | "resolved" | "dismissed";
export type StoryStatus = "draft" | "scheduled" | "published" | "expired" | "archived";

type Timestamp = string;

type ProfileRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  center_id: string | null;
  role: UserRole;
  avatar_key: string | null;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type RefRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: Timestamp;
};

type PostRow = {
  id: string;
  type: PostType;
  slug: string;
  title: string | null;
  excerpt: string | null;
  body: string | null;
  category_id: string | null;
  center_id: string | null;
  tags: string[];
  author_id: string | null;
  author_display: AuthorDisplay;
  status: PostStatus;
  scheduled_at: Timestamp | null;
  published_at: Timestamp | null;
  pinned_at: Timestamp | null;
  comments_enabled: boolean;
  cover_media_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string | null;
  parent_id: string | null;
  body: string;
  status: CommentStatus;
  created_at: Timestamp;
  edited_at: Timestamp | null;
};

type CommentReportRow = {
  id: string;
  comment_id: string;
  reporter_id: string | null;
  reason: string;
  status: ReportStatus;
  resolved_by: string | null;
  created_at: Timestamp;
  resolved_at: Timestamp | null;
};

type MediaRow = {
  id: string;
  owner_id: string;
  kind: MediaKind;
  status: MediaStatus;
  mime: string;
  size_bytes: number;
  original_key: string;
  variants: Json;
  poster_key: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  alt: string;
  error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Optional<ProfileRow, "first_name" | "last_name" | "center_id" | "role" | "avatar_key" | "is_active" | "created_at" | "updated_at">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      centers: {
        Row: RefRow;
        Insert: Optional<RefRow, "id" | "sort_order" | "is_active" | "created_at">;
        Update: Partial<RefRow>;
        Relationships: [];
      };
      categories: {
        Row: RefRow;
        Insert: Optional<RefRow, "id" | "sort_order" | "is_active" | "created_at">;
        Update: Partial<RefRow>;
        Relationships: [];
      };
      app_settings: {
        Row: { key: string; value: Json; updated_by: string | null; updated_at: Timestamp };
        Insert: { key: string; value: Json; updated_by?: string | null; updated_at?: Timestamp };
        Update: { key?: string; value?: Json; updated_by?: string | null; updated_at?: Timestamp };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          push_pinned: boolean;
          push_followed_categories: boolean;
          digest_email: boolean;
          theme: "system" | "light" | "dark";
          updated_at: Timestamp;
        };
        Insert: {
          user_id: string;
          push_pinned?: boolean;
          push_followed_categories?: boolean;
          digest_email?: boolean;
          theme?: "system" | "light" | "dark";
          updated_at?: Timestamp;
        };
        Update: {
          user_id?: string;
          push_pinned?: boolean;
          push_followed_categories?: boolean;
          digest_email?: boolean;
          theme?: "system" | "light" | "dark";
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
      posts: {
        Row: PostRow;
        Insert: Optional<
          PostRow,
          | "id" | "slug" | "title" | "excerpt" | "body" | "category_id" | "center_id" | "tags"
          | "author_id" | "author_display" | "status" | "scheduled_at" | "published_at"
          | "pinned_at" | "comments_enabled" | "cover_media_id" | "created_at" | "updated_at" | "deleted_at"
        >;
        Update: Partial<PostRow>;
        Relationships: [];
      };
      comments: {
        Row: CommentRow;
        Insert: Optional<CommentRow, "id" | "user_id" | "parent_id" | "status" | "created_at" | "edited_at">;
        Update: Partial<CommentRow>;
        Relationships: [];
      };
      comment_reports: {
        Row: CommentReportRow;
        Insert: Optional<CommentReportRow, "id" | "reporter_id" | "status" | "resolved_by" | "created_at" | "resolved_at">;
        Update: Partial<CommentReportRow>;
        Relationships: [];
      };
      reactions: {
        Row: { post_id: string; user_id: string; kind: ReactionKindDb; created_at: Timestamp };
        Insert: { post_id: string; user_id: string; kind: ReactionKindDb; created_at?: Timestamp };
        Update: { kind?: ReactionKindDb };
        Relationships: [];
      };
      bookmarks: {
        Row: { post_id: string; user_id: string; created_at: Timestamp };
        Insert: { post_id: string; user_id: string; created_at?: Timestamp };
        Update: never;
        Relationships: [];
      };
      post_views: {
        Row: { post_id: string; user_id: string; first_viewed_at: Timestamp };
        Insert: { post_id: string; user_id: string; first_viewed_at?: Timestamp };
        Update: never;
        Relationships: [];
      };
      post_media: {
        Row: { post_id: string; media_id: string; position: number; alt: string | null; crop: Json | null };
        Insert: { post_id: string; media_id: string; position?: number; alt?: string | null; crop?: Json | null };
        Update: { position?: number; alt?: string | null; crop?: Json | null };
        Relationships: [];
      };
      media: {
        Row: MediaRow;
        Insert: Optional<MediaRow, "id" | "status" | "variants" | "poster_key" | "width" | "height" | "duration_s" | "alt" | "error" | "created_at" | "updated_at">;
        Update: Partial<MediaRow>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      auth_role: { Args: Record<string, never>; Returns: UserRole | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_editor: { Args: Record<string, never>; Returns: boolean };
      is_allowed_email: { Args: { p_email: string }; Returns: boolean };
      ensure_profile: { Args: Record<string, never>; Returns: ProfileRow };
      export_user_data: { Args: { p_user_id: string }; Returns: Json };
      anonymize_user_data: { Args: { p_user_id: string }; Returns: undefined };
      publish_scheduled: { Args: Record<string, never>; Returns: undefined };
      get_feed: {
        Args: {
          p_limit?: number;
          p_cursor_at?: string | null;
          p_cursor_id?: string | null;
          p_category?: string | null;
          p_center?: string | null;
          p_q?: string | null;
          p_bookmarked?: boolean;
          p_tag?: string | null;
        };
        Returns: Json[];
      };
      get_pinned_posts: { Args: Record<string, never>; Returns: Json[] };
      get_post: { Args: { p_slug: string }; Returns: Json };
      get_post_by_id: { Args: { p_id: string }; Returns: Json };
      toggle_reaction: { Args: { p_post_id: string; p_kind: ReactionKindDb }; Returns: Json };
      toggle_bookmark: { Args: { p_post_id: string }; Returns: boolean };
      record_post_view: { Args: { p_post_id: string }; Returns: undefined };
      get_comments: { Args: { p_post_id: string }; Returns: Json[] };
      studio_stats: { Args: Record<string, never>; Returns: Json };
    };
    Enums: {
      user_role: UserRole;
      post_type: PostType;
      post_status: PostStatus;
      author_display: AuthorDisplay;
      media_kind: MediaKind;
      media_status: MediaStatus;
      reaction_kind: ReactionKindDb;
      comment_status: CommentStatus;
      report_status: ReportStatus;
      story_status: StoryStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Profile = Tables<"profiles">;
export type Center = Tables<"centers">;
export type Category = Tables<"categories">;
export type Post = Tables<"posts">;
