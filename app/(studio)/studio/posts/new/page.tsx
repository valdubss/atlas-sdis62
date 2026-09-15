import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchCategories, fetchCenters, fetchMediaItem } from "@/lib/feed/queries";
import { getCurrentUser } from "@/lib/supabase/server";
import { PostEditor } from "@/components/studio/PostEditor";

export const metadata: Metadata = { title: "Nouvelle publication" };
export const dynamic = "force-dynamic";

const TYPES = ["text", "photo", "video", "article", "poll"] as const;

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ type?: string; media?: string }> }) {
  const { type, media } = await searchParams;
  const defaultType = (TYPES as readonly string[]).includes(type ?? "") ? (type as (typeof TYPES)[number]) : undefined;
  const [current, categories, centers] = await Promise.all([getCurrentUser(), fetchCategories(), fetchCenters()]);
  if (!current) redirect("/login");
  const authorName = `${current.profile.first_name} ${current.profile.last_name}`.trim() || current.profile.email;
  // Média pré-rempli (« Utiliser dans un post » depuis la messagerie)
  const initialMedia = media && /^[0-9a-f-]{36}$/.test(media) ? await fetchMediaItem(media) : null;

  return <PostEditor post={null} categories={categories} centers={centers} authorName={authorName} defaultType={defaultType} initialMedia={initialMedia ? [initialMedia] : undefined} />;
}
