"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { StoryGroup, StoryItem } from "@/lib/feed/types";
import { REACTIONS, type ReactionKind } from "@/lib/config";
import { friendlyDbError } from "@/lib/validation/comment";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Stories d'une série active ou d'un à-la-une (RLS lecteur). */
export async function fetchStoryItems(group: Pick<StoryGroup, "id" | "kind">): Promise<StoryItem[]> {
  const supabase = await createClient();
  const { data, error } =
    group.kind === "highlight"
      ? await supabase.rpc("get_highlight_items", { p_highlight_id: group.id })
      : await supabase.rpc("get_story_items", { p_series_id: group.id, p_highlight_id: null });
  if (error) return [];
  return (data ?? []) as unknown as StoryItem[];
}

export async function recordStoryView(storyId: string) {
  const supabase = await createClient();
  await supabase.rpc("record_story_view", { p_story_id: storyId });
}

/** Progression maximale atteinte (0–100) et passage manuel à la story suivante. */
export async function recordStoryProgress(storyId: string, pct: number, advanced: boolean) {
  if (!z.uuid().safeParse(storyId).success) return;
  const supabase = await createClient();
  await supabase.rpc("record_story_progress", { p_story_id: storyId, p_pct: Math.round(pct), p_advanced: advanced });
}

/** Pose, change ou retire (null) sa réaction ; visible du service communication seulement. */
export async function setStoryReaction(storyId: string, kind: ReactionKind | null): Promise<Result<{ mine: ReactionKind | null }>> {
  if (!z.uuid().safeParse(storyId).success) return { ok: false, error: "Identifiant invalide." };
  if (kind !== null && !REACTIONS.some((r) => r.kind === kind)) return { ok: false, error: "Réaction inconnue." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_story_reaction", { p_story_id: storyId, p_kind: kind });
  if (error) return { ok: false, error: error.message.includes("STORY_INDISPONIBLE") ? "Cette story n'est plus en ligne." : friendlyDbError(error.message) };
  return { ok: true, mine: ((data as { mine?: ReactionKind | null } | null)?.mine ?? null) as ReactionKind | null };
}

/** Vote à un sondage de story (une seule voix) ; renvoie la répartition. */
export async function voteStoryPoll(pollId: string, option: number): Promise<Result<{ my_vote: number | null; counts: number[] | null }>> {
  if (!z.uuid().safeParse(pollId).success || !Number.isInteger(option) || option < 0 || option > 3) return { ok: false, error: "Vote invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vote_story_poll", { p_poll_id: pollId, p_option: option });
  if (error) return { ok: false, error: error.message.includes("STORY_INDISPONIBLE") ? "Cette story n'est plus en ligne." : friendlyDbError(error.message) };
  const d = (data ?? {}) as { my_vote?: number | null; counts?: number[] | null };
  return { ok: true, my_vote: d.my_vote ?? null, counts: d.counts ?? null };
}

const answerSchema = z.object({ question_id: z.uuid(), answer: z.string().trim().min(1, "Réponse vide.").max(200, "200 caractères maximum.") });

/** Réponse à une question de story, lisible du service communication seulement. */
export async function answerStoryQuestion(questionId: string, answer: string): Promise<Result> {
  const parsed = answerSchema.safeParse({ question_id: questionId, answer });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Réponse invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("story_question_answers").insert({ question_id: parsed.data.question_id, user_id: user.id, answer: parsed.data.answer });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}
