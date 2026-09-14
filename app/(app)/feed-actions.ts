"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchFeed } from "@/lib/feed/queries";
import type { CommentItem, FeedCursor, FeedParams, FeedPost, GalleryItem, Poll, ReactionCounts } from "@/lib/feed/types";
import type { ReactionKind } from "@/lib/config";
import { commentSchema, friendlyDbError, reportSchema } from "@/lib/validation/comment";

export async function loadMoreFeed(params: FeedParams, cursor: FeedCursor): Promise<FeedPost[]> {
  return fetchFeed(params, cursor);
}

export async function reactToPost(
  postId: string,
  kind: ReactionKind,
): Promise<{ ok: true; reaction_counts: ReactionCounts; my_reaction: ReactionKind | null } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_reaction", { p_post_id: postId, p_kind: kind });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  const r = data as { reaction_counts: ReactionCounts; my_reaction: ReactionKind | null };
  return { ok: true, ...r };
}

export async function toggleBookmark(postId: string): Promise<{ ok: true; bookmarked: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_bookmark", { p_post_id: postId });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/favoris");
  return { ok: true, bookmarked: Boolean(data) };
}

export async function votePoll(postId: string, optionId: string): Promise<{ ok: true; poll: Poll } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vote_poll", { p_post_id: postId, p_option_id: optionId });
  if (error) {
    const m = error.message;
    const msg = m.includes("SONDAGE_CLOS") ? "Ce sondage est clos." : m.includes("DEJA_VOTE") ? "Vous avez déjà voté." : friendlyDbError(m);
    return { ok: false, error: msg };
  }
  return { ok: true, poll: data as unknown as Poll };
}

export async function loadMoreGallery(cursor: { at: string; id: string; position: number } | null): Promise<GalleryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_gallery", {
    p_limit: 30,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_cursor_pos: cursor?.position ?? null,
  });
  if (error) return [];
  return (data ?? []) as unknown as GalleryItem[];
}

export async function recordView(postId: string) {
  const supabase = await createClient();
  await supabase.rpc("record_post_view", { p_post_id: postId });
}

export async function fetchComments(postId: string): Promise<CommentItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_comments", { p_post_id: postId });
  if (error) return [];
  return (data ?? []) as unknown as CommentItem[];
}

export async function postComment(input: {
  post_id: string;
  parent_id: string | null;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Commentaire invalide." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." };

  const { error } = await supabase.from("comments").insert({
    post_id: parsed.data.post_id,
    parent_id: parsed.data.parent_id,
    body: parsed.data.body,
    user_id: user.id,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}

export async function reportComment(input: {
  comment_id: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Signalement invalide." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase.from("comment_reports").insert({
    comment_id: parsed.data.comment_id,
    reason: parsed.data.reason,
    reporter_id: user.id,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}

/** Éditeurs : masquer / rétablir un commentaire. */
export async function moderateComment(
  commentId: string,
  status: "visible" | "hidden" | "deleted",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("comments").update({ status }).eq("id", commentId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}
