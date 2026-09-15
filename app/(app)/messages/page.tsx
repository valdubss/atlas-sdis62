import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConversationList } from "@/components/messages/ConversationList";
import { listConversations } from "./actions";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

/** Messagerie de travail : liste des conversations (éditeurs, référents, invités). */
export default async function MessagesPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_use_messaging");
  if (!allowed) redirect("/");
  const list = await listConversations();
  return (
    <div className="space-y-4">
      <PageHeader title="Messages" />
      <ConversationList initial={list} canCreate={isEditorRole(current.profile.role)} />
    </div>
  );
}
