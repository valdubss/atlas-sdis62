import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { RegistryAdmin } from "@/components/admin/RegistryAdmin";

export const metadata: Metadata = { title: "Agents référencés" };
export const dynamic = "force-dynamic";

/**
 * Administration → Agents référencés : la liste des matricules autorisés à créer un accès
 * (mode « première connexion par matricule »). Import par collage ou CSV, recherche, retrait.
 */
export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  if (current.profile.role !== "admin") redirect("/admin");
  const { q = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("agents_registry").select("matricule, email, personal_email, activated_at, last_name, first_name, center_name, status, imported_at", { count: "exact" }).order("matricule").limit(200);
  const needle = q.trim();
  if (needle) {
    const safe = needle.replace(/[%,()]/g, " ").trim();
    query = query.or(`matricule.ilike.%${safe}%,last_name.ilike.%${safe}%,first_name.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  const [{ data: rows, count }, { count: total }, { data: setting }, { data: linked }] = await Promise.all([
    query,
    supabase.from("agents_registry").select("matricule", { count: "exact", head: true }),
    supabase.from("app_settings").select("value").eq("key", "auth_first_access").maybeSingle(),
    supabase.from("profiles").select("matricule").not("matricule", "is", null),
  ]);
  const linkedSet = new Set((linked ?? []).map((p) => (p.matricule ?? "").toUpperCase()));

  return <RegistryAdmin rows={(rows ?? []).map((r) => ({ ...r, linked: linkedSet.has(r.matricule.toUpperCase()) }))} shown={count ?? 0} total={total ?? 0} query={needle} registryMode={setting?.value === "registry"} />;
}
