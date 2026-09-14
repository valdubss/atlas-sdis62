import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchCategories, fetchCenters } from "@/lib/feed/queries";
import { getCurrentUser } from "@/lib/supabase/server";
import { PostEditor } from "@/components/studio/PostEditor";

export const metadata: Metadata = { title: "Nouvelle publication" };
export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const [current, categories, centers] = await Promise.all([getCurrentUser(), fetchCategories(), fetchCenters()]);
  if (!current) redirect("/login");
  const authorName = `${current.profile.first_name} ${current.profile.last_name}`.trim() || current.profile.email;

  return <PostEditor post={null} categories={categories} centers={centers} authorName={authorName} />;
}
