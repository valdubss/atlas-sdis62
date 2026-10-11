import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { BackBar } from "@/components/layout/BackBar";
import { LargeTitle } from "@/components/layout/TopBar";
import { NewGroupFlow } from "@/components/messages/NewGroupFlow";
import { messagingDirectory } from "../actions";

export const metadata: Metadata = { title: "Nouvelle conversation" };
export const dynamic = "force-dynamic";

/**
 * Nouvelle conversation : le service communication choisit dans tout le SDIS ; un agent ne
 * voit que les membres de son centre (chef de centre et responsable com compris), la base
 * refusant tout autre membre.
 */
export default async function NewGroupPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const editor = isEditorRole(current.profile.role);
  if (!editor) {
    const supabase = await createClient();
    const { data: allowed } = await supabase.rpc("can_use_messaging");
    if (!allowed) redirect("/messages");
  }
  const people = await messagingDirectory(null);
  const title = editor ? "Nouveau groupe" : "Nouvelle conversation";
  return (
    <div className="space-y-4">
      <BackBar title={title} href="/messages" />
      <LargeTitle>{title}</LargeTitle>
      {!editor && <p className="px-1 text-[13px] text-text-3">Avec les agents de votre centre, chef de centre et responsable communication compris.</p>}
      <NewGroupFlow initialPeople={people} scope={editor ? "all" : "center"} />
    </div>
  );
}
