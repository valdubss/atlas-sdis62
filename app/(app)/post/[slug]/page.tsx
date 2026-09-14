import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPostBySlug } from "@/lib/feed/queries";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { PostCard } from "@/components/feed/PostCard";
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
      <Link href="/" className="inline-flex items-center gap-1 px-4 text-sm font-semibold text-navy sm:px-0">
        ← Retour au fil
      </Link>
      <ViewTracker postId={post.id} />
      <PostCard post={post} variant="full" canModerate={isEditorRole(current?.profile.role)} />
    </div>
  );
}
