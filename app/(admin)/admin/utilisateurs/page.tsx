import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { UsersTable, type UserRow } from "@/components/studio/UsersTable";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Utilisateurs" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/**
 * Administration → Utilisateurs : liste paginée (100 par page), recherche côté
 * serveur, filtres, actions groupées, fiche par compte. Administrateurs seulement.
 */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; filtre?: string }> }) {
  const { q = "", page: pageParam = "1", filtre } = await searchParams;
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

  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();
  let query = supabase
    .from("profiles_editor")
    .select("id, email, first_name, last_name, role, is_active, created_at, onboarded_at, center_id, service_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (q.trim()) {
    const term = `%${q.trim().replace(/[,()"%_\\]/g, "")}%`;
    query = query.or(`email.ilike."${term}",first_name.ilike."${term}",last_name.ilike."${term}"`);
  }
  const [{ data, count }, { data: centers }, { data: services }] = await Promise.all([
    query,
    supabase.from("centers").select("id, name").order("sort_order").order("name"),
    supabase.from("services").select("id, name").order("sort_order").order("name"),
  ]);
  const rows = (data ?? []) as unknown as Omit<UserRow, "center" | "service" | "last_sign_in_at">[];
  // Dernière connexion réelle (auth), pour « jamais connecté » et la fiche
  const { data: lastSeen } = rows.length ? await supabase.rpc("admin_last_sign_in", { p_ids: rows.map((r) => r.id) }) : { data: null };
  const seen = (lastSeen ?? {}) as Record<string, string | null>;
  const centerName = new Map((centers ?? []).map((c) => [c.id, c.name]));
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const users: UserRow[] = rows.map((u) => ({
    ...u,
    last_sign_in_at: seen[u.id] ?? null,
    center: u.center_id && centerName.has(u.center_id) ? { name: centerName.get(u.center_id)! } : null,
    service: u.service_id && serviceName.has(u.service_id) ? { name: serviceName.get(u.service_id)! } : null,
  }));

  return (
    <UsersTable
      users={users}
      meId={current.user.id}
      q={q}
      centers={centers ?? []}
      services={services ?? []}
      basePath="/admin/utilisateurs"
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? users.length}
      initialFilter={filtre}
    />
  );
}
