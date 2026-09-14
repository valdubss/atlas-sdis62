/**
 * Types de la base Supabase.
 *
 * Ce fichier est écrit à la main pour le lot (a) et couvre les tables utilisées
 * par l'application. Une fois le projet Supabase lié, il se régénère avec :
 *
 *   npm run db:types
 *
 * (= supabase gen types typescript --linked > lib/supabase/database.types.ts)
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
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
        Insert: {
          id: string;
          email: string;
          first_name?: string;
          last_name?: string;
          center_id?: string | null;
          role?: UserRole;
          avatar_key?: string | null;
          is_active?: boolean;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string;
          last_name?: string;
          center_id?: string | null;
          role?: UserRole;
          avatar_key?: string | null;
          is_active?: boolean;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
      centers: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_by: string | null;
          updated_at: Timestamp;
        };
        Insert: {
          key: string;
          value: Json;
          updated_by?: string | null;
          updated_at?: Timestamp;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_by?: string | null;
          updated_at?: Timestamp;
        };
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
      export_user_data: { Args: { p_user_id: string }; Returns: Json };
      anonymize_user_data: { Args: { p_user_id: string }; Returns: undefined };
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
