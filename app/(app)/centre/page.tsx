import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { fetchDirectory } from "@/lib/centres/public";
import { PageHeader } from "@/components/layout/PageHeader";
import { CenterPicker } from "@/components/centre/CenterPicker";
import { fetchMyPendingRequest } from "@/lib/membership/request";
import { formatDateLong } from "@/lib/format";

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

  const [directory, pending] = await Promise.all([fetchDirectory(), fetchMyPendingRequest(profile.id)]);
  return (
    <div className="space-y-3">
      <PageHeader title="Mon centre" />
      {pending ? (
        <section className="rounded-[16px] bg-bg-1 px-5 py-4">
          <p className="text-[15px] text-text-1">
            Demande envoyée : <span className="font-semibold">{pending.center?.name ?? pending.service?.name}</span>
          </p>
          <p className="mt-1 text-[13px] text-text-3">Votre chef de centre (ou le service communication) confirme votre arrivée. Valable jusqu&apos;au {formatDateLong(pending.expires_at)}. Vous pouvez la retirer depuis Profil → Mon centre.</p>
        </section>
      ) : (
        <p className="px-1 text-[15px] text-text-2">Choisissez votre centre ou votre service : votre chef de centre confirme votre arrivée, puis sa page devient votre onglet « Mon centre ».</p>
      )}
      <CenterPicker directory={directory} mode="attach" />
    </div>
  );
}
