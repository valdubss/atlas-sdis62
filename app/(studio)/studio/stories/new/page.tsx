import type { Metadata } from "next";
import { StoryEditor } from "@/components/studio/StoryEditor";
import { loadEditorData } from "../load";

export const metadata: Metadata = { title: "Nouvelle story" };
export const dynamic = "force-dynamic";

export default async function NewStoryPage() {
  const { series, posts } = await loadEditorData();
  return <StoryEditor story={null} series={series} posts={posts} />;
}
