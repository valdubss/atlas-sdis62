import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { fetchDirectory } from "@/lib/centres/public";
import { PageHeader } from "@/components/layout/PageHeader";
import { CenterPicker } from "@/components/centre/CenterPicker";

export const metadata: Metadata = { title: "Mon centre" };
export const dynamic = "force-dynamic";

/** Onglet « Mon centre » : redirige vers la page du rattachement, sinon écran de rattachement. */
export default async function MyCenterPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const { profile } = current;
  const supabase = await createClient();

  if (profile.center_id) {
    const { data } = await supabase.from("centers").select("slug").eq("id", profile.center_id).eq("is_active", true).maybeSingle();
    if (data) redirect(`/centre/${data.slug}`);
  } else if (profile.service_id) {
    const { data } = await supabase.from("services").select("slug").eq("id", profile.service_id).eq("is_active", true).maybeSingle();
    if (data) redirect(`/service/${data.slug}`);
  }

  const directory = await fetchDirectory();
  return (
    <div className="space-y-3">
      <PageHeader title="Mon centre" />
      <p className="px-1 text-[15px] text-text-2">Choisissez votre centre ou votre service : sa page devient votre onglet « Mon centre ». Vous pourrez changer depuis votre profil.</p>
      <CenterPicker directory={directory} mode="attach" />
    </div>
  );
}
