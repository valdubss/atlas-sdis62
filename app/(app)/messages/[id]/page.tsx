import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { Conversation } from "@/components/messages/Conversation";
import { fetchChannelInfo, fetchMessages, fetchReadsState } from "../actions";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const [info, messages, reads] = await Promise.all([fetchChannelInfo(id), fetchMessages(id), fetchReadsState(id)]);
  if (!info) notFound();
  const myLastReadAt = reads.find((r) => r.profile_id === current.user.id)?.last_read_at ?? null;
  return <Conversation info={info} initial={messages} initialReads={reads} myLastReadAt={myLastReadAt} me={current.user.id} isEditor={isEditorRole(current.profile.role)} />;
}
