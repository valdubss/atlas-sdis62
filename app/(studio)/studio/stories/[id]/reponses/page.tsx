import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchStoryById } from "@/lib/feed/queries";
import { formatDateTime } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";

export const metadata: Metadata = { title: "Réponses à la story" };
export const dynamic = "force-dynamic";

type Reply = {
  id: string;
  emoji: string | null;
  message: string | null;
  created_at: string;
  author: { first_name: string; last_name: string; avatar_key: string | null; center: { name: string } | null } | null;
};

/** Studio : réponses (emoji, messages) reçues sur une story. */
export default async function StoryRepliesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [story, { data }] = await Promise.all([
    fetchStoryById(id),
    supabase
      .from("story_replies")
      .select("id, emoji, message, created_at, author:profiles!story_replies_user_id_fkey(first_name, last_name, avatar_key, center:centers(name))")
      .eq("story_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (!story) notFound();
  const replies = (data ?? []) as unknown as Reply[];
  // Marquage « lu » : réponses de cette story
  await supabase.from("story_replies").update({ read_at: new Date().toISOString() }).eq("story_id", id).is("read_at", null);

  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-text-1 sm:text-[28px]">Réponses à la story</h1>
        <Link href={`/studio/stories/${id}`} className="pressable text-[15px] font-medium text-text-2 hover:text-text-1">
          Modifier la story
        </Link>
      </div>
      <p className="text-[15px] text-text-2">
        {story.series_title ?? "Story"}
        {story.overlay?.text && ` — ${story.overlay.text}`} · {replies.length} {replies.length > 1 ? "réponses" : "réponse"}
      </p>
      <div className="hairline rounded-[16px] bg-bg-1">
        {replies.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-text-2">Aucune réponse pour le moment.</p>
        ) : (
          replies.map((r) => {
            const name = r.author ? `${r.author.first_name} ${r.author.last_name}`.trim() : "Agent supprimé";
            return (
              <div key={r.id} className="flex items-start gap-3 px-5 py-3">
                <Avatar name={name} avatarKey={r.author?.avatar_key} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-text-3">
                    <span className="font-medium text-text-1">{name}</span>
                    {r.author?.center?.name && ` · ${r.author.center.name}`} · {formatDateTime(r.created_at)}
                  </p>
                  {r.emoji && <p className="text-[24px] leading-tight">{r.emoji}</p>}
                  {r.message && <p className="whitespace-pre-line text-[15px] text-text-1">{r.message}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
