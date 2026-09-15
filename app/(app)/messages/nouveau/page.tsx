import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { BackBar } from "@/components/layout/BackBar";
import { LargeTitle } from "@/components/layout/TopBar";
import { NewGroupFlow } from "@/components/messages/NewGroupFlow";
import { messagingDirectory } from "../actions";

export const metadata: Metadata = { title: "Nouveau groupe" };
export const dynamic = "force-dynamic";

/** Création d'un groupe (éditeurs seulement) : membres puis informations. */
export default async function NewGroupPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!isEditorRole(current.profile.role)) redirect("/messages");
  const people = await messagingDirectory(null);
  return (
    <div className="space-y-4">
      <BackBar title="Nouveau groupe" href="/messages" />
      <LargeTitle>Nouveau groupe</LargeTitle>
      <NewGroupFlow initialPeople={people} />
    </div>
  );
}
