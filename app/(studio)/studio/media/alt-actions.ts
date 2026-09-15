"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";

/** La proposition de texte alternatif n'est offerte que si une clé d'API vision est configurée. */
export async function altAssistEnabled(): Promise<boolean> {
  return Boolean(process.env.VISION_API_KEY);
}

/**
 * Propose un texte alternatif (≤ 125 caractères, français) via l'API Claude
 * (`VISION_API_KEY`, modèle `VISION_MODEL`, défaut claude-haiku-4-5). Toujours
 * éditable, jamais publié sans relecture : le studio l'insère dans le champ.
 */
export async function suggestAlt(mediaId: string): Promise<{ ok: true; alt: string } | { ok: false; error: string }> {
  if (!process.env.VISION_API_KEY) return { ok: false, error: "Assistance non configurée." };
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: media } = await supabase.from("media").select("kind, variants, status").eq("id", mediaId).maybeSingle();
  if (!media || media.kind !== "image" || media.status !== "ready") return { ok: false, error: "Image non prête." };
  const key = (media.variants as { small?: string; medium?: string }).small ?? (media.variants as { medium?: string }).medium;
  if (!key) return { ok: false, error: "Variante introuvable." };
  try {
    const bytes = await getStorage().getObject(key);
    const res = await fetch((process.env.VISION_API_URL ?? "https://api.anthropic.com/v1/messages").replace(/\/$/, ""), {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.VISION_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.VISION_MODEL ?? "claude-haiku-4-5",
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/webp", data: bytes.toString("base64") } },
              { type: "text", text: "Décris cette photo en français pour un texte alternatif destiné aux agents d'un service d'incendie et de secours : une phrase factuelle de 125 caractères au plus, sans « image de », sans supposer l'identité des personnes. Réponds uniquement par la phrase." },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `Assistance indisponible (${res.status}).` };
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).find((c) => c.type === "text")?.text?.trim().replace(/^"|"$/g, "") ?? "";
    if (!text) return { ok: false, error: "Aucune proposition." };
    return { ok: true, alt: text.slice(0, 160) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Assistance indisponible." };
  }
}
