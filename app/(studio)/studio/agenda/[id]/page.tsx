import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchEventById } from "@/lib/agenda/queries";
import { EventEditor } from "@/components/studio/EventEditor";
import { loadPostRefs } from "../load";

export const metadata: Metadata = { title: "Modifier l'événement" };
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, posts] = await Promise.all([fetchEventById(id), loadPostRefs()]);
  if (!event) notFound();
  return <EventEditor event={event} posts={posts} />;
}
