import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { BackBar } from "@/components/layout/BackBar";
import { LargeTitle } from "@/components/layout/TopBar";
import { MyActivity, type MyActivityData } from "@/components/profile/MyActivity";

export const metadata: Metadata = { title: "Mon activité" };
export const dynamic = "force-dynamic";

export default async function MyActivityPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const supabase = await createClient();
  const [{ data }, { data: canMessage }] = await Promise.all([supabase.rpc("my_activity"), supabase.rpc("can_use_messaging")]);
  const a = (data ?? { reactions: 0, bookmarks: 0, comments: 0, proposals: 0, messages: 0, story_reactions: 0, recent_reactions: [], recent_comments: [] }) as unknown as MyActivityData;
  return (
    <div className="space-y-3">
      <BackBar title="Mon activité" href="/profil" />
      <LargeTitle>Mon activité</LargeTitle>
      <MyActivity a={a} canMessage={isEditorRole(current.profile.role) || Boolean(canMessage)} isReferent={current.profile.role === "referent"} />
    </div>
  );
}
