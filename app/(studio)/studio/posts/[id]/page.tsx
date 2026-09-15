import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchCategories, fetchCenters, fetchPostById } from "@/lib/feed/queries";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { PostEditor } from "@/components/studio/PostEditor";

export const metadata: Metadata = { title: "Modifier la publication" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  published: "Publication en ligne. Elle apparaît dans le fil des agents.",
  scheduled: "Publication programmée. Elle paraîtra automatiquement à la date choisie.",
  draft: "Brouillon enregistré.",
};

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const [{ id }, { ok }] = await Promise.all([params, searchParams]);
  const [current, post, categories, centers] = await Promise.all([
    getCurrentUser(),
    fetchPostById(id),
    fetchCategories(),
    fetchCenters(),
  ]);
  if (!current) redirect("/login");
  if (!post) notFound();
  const supabase = await createClient();
  const { data: reviewRow } = await supabase.from("posts").select("review_status").eq("id", id).maybeSingle();
  const authorName = `${current.profile.first_name} ${current.profile.last_name}`.trim() || current.profile.email;

  return (
    <PostEditor
      post={post}
      categories={categories}
      centers={centers}
      authorName={authorName}
      notice={ok ? NOTICES[ok] ?? null : null}
      isAdmin={current.profile.role === "admin"}
      reviewStatus={(reviewRow?.review_status as "none" | "requested" | "approved" | "returned" | undefined) ?? "none"}
    />
  );
}
