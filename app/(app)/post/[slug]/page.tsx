import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPostBySlug } from "@/lib/feed/queries";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { PostCard } from "@/components/feed/PostCard";
import { BackBar } from "@/components/layout/BackBar";
import { ViewTracker } from "./ViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);
  return { title: post?.title ?? "Publication" };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, current] = await Promise.all([fetchPostBySlug(slug), getCurrentUser()]);
  if (!post) notFound();

  return (
    <div className="space-y-3">
      <BackBar title={post.title ?? "Publication"} />
      <ViewTracker postId={post.id} />
      <PostCard post={post} variant="full" canModerate={isEditorRole(current?.profile.role)} />
    </div>
  );
}
