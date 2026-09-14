"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";

const schema = z
  .object({
    story_id: z.uuid(),
    emoji: z.string().trim().max(8).optional(),
    message: z.string().trim().max(500, "500 caractères maximum.").optional(),
  })
  .refine((v) => Boolean(v.emoji || v.message), { message: "Réponse vide." });

/** Réponse à une story (emoji ou message), visible du service communication seulement. */
export async function replyToStory(input: { story_id: string; emoji?: string; message?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Réponse invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("story_replies").insert({
    story_id: parsed.data.story_id,
    user_id: user.id,
    emoji: parsed.data.emoji || null,
    message: parsed.data.message || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}
