import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchStoryById } from "@/lib/feed/queries";
import { StoryEditor } from "@/components/studio/StoryEditor";
import { loadEditorData } from "../load";

export const metadata: Metadata = { title: "Modifier la story" };
export const dynamic = "force-dynamic";

export default async function EditStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [story, { series, posts }] = await Promise.all([fetchStoryById(id), loadEditorData()]);
  if (!story) notFound();
  return <StoryEditor story={story} series={series} posts={posts} />;
}
