import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { BackBar } from "@/components/layout/BackBar";
import { GroupInfo } from "@/components/messages/GroupInfo";
import { fetchChannelInfo } from "../../actions";

export const metadata: Metadata = { title: "Informations" };
export const dynamic = "force-dynamic";

export default async function ChannelInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const info = await fetchChannelInfo(id);
  if (!info) notFound();
  return (
    <div className="space-y-4">
      <BackBar title={info.name} href={`/messages/${id}`} />
      <GroupInfo info={info} me={current.user.id} isEditor={isEditorRole(current.profile.role)} />
    </div>
  );
}
