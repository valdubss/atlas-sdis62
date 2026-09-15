import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVideoProvider } from "@/lib/video/provider";
import { cuesFromSegments, type Cue } from "@/lib/video/vtt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** La génération n'est proposée que si un fournisseur est configuré (gratuit possible : Groq). */
function transcriptionEnabled() {
  return Boolean(process.env.TRANSCRIPTION_API_KEY);
}

/**
 * Sous-titres automatiques : audio extrait (mono 16 kHz) puis envoyé à une API
 * compatible « OpenAI audio/transcriptions » (Whisper). Résultat en cues éditables,
 * jamais publié sans relecture.
 */
export async function POST(req: NextRequest) {
  if (!transcriptionEnabled()) return NextResponse.json({ error: "transcription non configurée" }, { status: 501 });
  const body = (await req.json().catch(() => null)) as { mediaId?: string } | null;
  const mediaId = body?.mediaId;
  if (!mediaId || !z.uuid().safeParse(mediaId).success) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "editor" && me?.role !== "admin") return NextResponse.json({ error: "non autorisé" }, { status: 403 });

  const provider = await getVideoProvider();
  const audio = await provider.extractAudio(mediaId);
  const url = (process.env.TRANSCRIPTION_API_URL ?? "https://api.openai.com/v1/audio/transcriptions").replace(/\/$/, "");
  const model = process.env.TRANSCRIPTION_MODEL ?? "whisper-1";
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "audio.wav");
  form.set("model", model);
  form.set("language", "fr");
  form.set("response_format", "verbose_json");
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.TRANSCRIPTION_API_KEY}` }, body: form });
  if (!res.ok) return NextResponse.json({ error: `transcription : ${res.status} ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  const json = (await res.json()) as { text?: string; segments?: { start: number; end: number; text: string }[] };
  const cues: Cue[] = json.segments?.length ? cuesFromSegments(json.segments) : json.text ? [{ start: 0, end: 5, text: json.text }] : [];
  await supabase.from("media_subtitles").upsert({ media_id: mediaId, lang: "fr", source: "auto", cues, status: "draft", updated_by: user.id }, { onConflict: "media_id,lang" });
  return NextResponse.json({ cues });
}
