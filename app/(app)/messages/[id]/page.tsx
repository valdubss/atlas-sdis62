import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { Conversation } from "@/components/messages/Conversation";
import { fetchChannelInfo, fetchMessages } from "../actions";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const [info, messages] = await Promise.all([fetchChannelInfo(id), fetchMessages(id)]);
  if (!info) notFound();
  return <Conversation info={info} initial={messages} me={current.user.id} isEditor={isEditorRole(current.profile.role)} />;
}
