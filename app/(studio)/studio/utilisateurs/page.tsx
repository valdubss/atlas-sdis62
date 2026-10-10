import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { UsersTable, type UserRow } from "@/components/studio/UsersTable";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Utilisateurs" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");

  if (current.profile.role !== "admin") {
    return (
      <div className="mx-auto max-w-[960px] space-y-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Utilisateurs</h1>
        <div className="rounded-[16px] bg-bg-1">
          <EmptyState title="Réservé aux administrateurs" description="La gestion des rôles et des comptes relève de l'administrateur de la plateforme." />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  // Vue réservée aux éditeurs (adresse e-mail comprise) ; les centres et services sont résolus à part
  let query = supabase
    .from("profiles_editor")
    .select("id, email, first_name, last_name, role, is_active, created_at, onboarded_at, center_id, service_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q.trim()) {
    // Les virgules et parenthèses structurent le filtre PostgREST : on les retire
    const term = `%${q.trim().replace(/[,()"%_\\]/g, "")}%`;
    query = query.or(`email.ilike."${term}",first_name.ilike."${term}",last_name.ilike."${term}"`);
  }
  const [{ data }, { data: centers }, { data: services }] = await Promise.all([
    query,
    supabase.from("centers").select("id, name").order("sort_order").order("name"),
    supabase.from("services").select("id, name").order("sort_order").order("name"),
  ]);
  const centerName = new Map((centers ?? []).map((c) => [c.id, c.name]));
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const users = ((data ?? []) as unknown as Omit<UserRow, "center" | "service">[]).map((u) => ({
    ...u,
    center: u.center_id && centerName.has(u.center_id) ? { name: centerName.get(u.center_id)! } : null,
    service: u.service_id && serviceName.has(u.service_id) ? { name: serviceName.get(u.service_id)! } : null,
  }));

  return <UsersTable users={users} meId={current.user.id} q={q} centers={centers ?? []} services={services ?? []} />;
}
