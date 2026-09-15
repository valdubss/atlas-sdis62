import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Données de l'annuaire pour le mode hors ligne : centres et services avec
 * numéros et adresses. Ni personnes, ni photos. Mis en cache par le service
 * worker (« atlas-directory », réseau d'abord).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const [{ data: groupings }, { data: centers }, { data: services }] = await Promise.all([
    supabase.from("groupings").select("id, name, sort_order").order("sort_order").order("name"),
    supabase.from("centers").select("id, slug, name, type, grouping_id, address, postal_code, city, phone, email, lat, lng").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("services").select("id, slug, name, short_description, contact_reasons, phone, email, address, grouping_id").eq("is_active", true).order("sort_order").order("name"),
  ]);
  return NextResponse.json(
    { generated_at: new Date().toISOString(), groupings: groupings ?? [], centers: centers ?? [], services: services ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
