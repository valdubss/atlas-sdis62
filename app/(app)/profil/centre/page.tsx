import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { fetchDirectory, fetchFollows } from "@/lib/centres/public";
import { BackBar } from "@/components/layout/BackBar";
import { CenterSettingsForm } from "@/components/centre/CenterSettingsForm";

export const metadata: Metadata = { title: "Mon centre" };
export const dynamic = "force-dynamic";

export default async function ProfileCenterPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const { profile } = current;
  const supabase = await createClient();
  const [directory, follows, center, service] = await Promise.all([
    fetchDirectory(),
    fetchFollows(profile.id),
    profile.center_id ? supabase.from("centers").select("name, slug").eq("id", profile.center_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    profile.service_id ? supabase.from("services").select("name, slug").eq("id", profile.service_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  const home = center ? { name: center.name, href: `/centre/${center.slug}` } : service ? { name: service.name, href: `/service/${service.slug}` } : null;
  return (
    <div className="space-y-3">
      <BackBar title="Mon centre" href="/profil" />
      <CenterSettingsForm profile={profile} home={home} follows={follows} directory={directory} />
    </div>
  );
}
