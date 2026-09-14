import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ModerationLists, type HiddenComment, type Report, type RecentComment } from "@/components/studio/ModerationLists";

export const metadata: Metadata = { title: "Modération" };
export const dynamic = "force-dynamic";

/**
 * Modération : signalements ouverts, commentaires masqués, derniers commentaires.
 * Lecture avec la RLS éditeur (comment_reports, comments, profiles, posts).
 */
export default async function ModerationPage() {
  const supabase = await createClient();

  const [reportsRes, hiddenRes, recentRes] = await Promise.all([
    supabase
      .from("comment_reports")
      .select(
        "id, reason, status, created_at, reporter:profiles!comment_reports_reporter_id_fkey(first_name, last_name), comment:comments!comment_reports_comment_id_fkey(id, body, status, created_at, author:profiles!comments_user_id_fkey(first_name, last_name), post:posts!comments_post_id_fkey(id, slug, title, comments_enabled))",
      )
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("comments")
      .select("id, body, status, created_at, author:profiles!comments_user_id_fkey(first_name, last_name), post:posts!comments_post_id_fkey(id, slug, title, comments_enabled)")
      .eq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("comments")
      .select("id, body, status, created_at, author:profiles!comments_user_id_fkey(first_name, last_name), post:posts!comments_post_id_fkey(id, slug, title, comments_enabled)")
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <ModerationLists
      reports={(reportsRes.data ?? []) as unknown as Report[]}
      hidden={(hiddenRes.data ?? []) as unknown as HiddenComment[]}
      recent={(recentRes.data ?? []) as unknown as RecentComment[]}
    />
  );
}
