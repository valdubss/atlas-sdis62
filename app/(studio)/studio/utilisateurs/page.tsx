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
  let query = supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role, is_active, created_at, center:centers(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q.trim()) {
    // Les virgules et parenthèses structurent le filtre PostgREST : on les retire
    const term = `%${q.trim().replace(/[,()"%_\\]/g, "")}%`;
    query = query.or(`email.ilike."${term}",first_name.ilike."${term}",last_name.ilike."${term}"`);
  }
  const { data } = await query;

  return <UsersTable users={(data ?? []) as unknown as UserRow[]} meId={current.user.id} q={q} />;
}
