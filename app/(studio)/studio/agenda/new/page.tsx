import type { Metadata } from "next";
import { EventEditor } from "@/components/studio/EventEditor";
import { loadPostRefs } from "../load";

export const metadata: Metadata = { title: "Nouvel événement" };
export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const posts = await loadPostRefs();
  return <EventEditor event={null} posts={posts} />;
}
