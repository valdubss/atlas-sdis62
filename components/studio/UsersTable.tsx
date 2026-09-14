"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteUser, exportUserData, setUserActive, setUserRole } from "@/app/(studio)/studio/utilisateurs/actions";
import type { UserRole } from "@/lib/supabase/database.types";
import { ROLE_LABELS } from "@/lib/config";
import { formatDateLong } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  center: { name: string } | null;
};

/**
 * Gestion des comptes (administrateur) : rôle, désactivation, export et
 * suppression RGPD. Liste aérée à séparateurs, actions dans une sheet.
 */
export function UsersTable({ users, meId, q }: { users: UserRow[]; meId: string; q: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [search, setSearch] = useState(q);
  const [pending, start] = useTransition();
  const toast = useToast();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string, close = false) {
    start(async () => {
      const res = await fn();
      toast(res.ok ? okMessage : (res.error ?? "Erreur"));
      if (res.ok && close) setSelected(null);
    });
  }

  function exportJson(u: UserRow) {
    start(async () => {
      const res = await exportUserData(u.id);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atlas-export-${u.email.replace(/[^a-z0-9]+/gi, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Export téléchargé");
    });
  }

  const counts = {
    admin: users.filter((u) => u.role === "admin").length,
    editor: users.filter((u) => u.role === "editor").length,
    reader: users.filter((u) => u.role === "reader").length,
  };

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Utilisateurs</h1>
          <p className="text-[13px] text-text-3">
            {users.length} comptes, {counts.admin} administrateurs, {counts.editor} éditeurs, {counts.reader} agents
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(search.trim() ? `/studio/utilisateurs?q=${encodeURIComponent(search.trim())}` : "/studio/utilisateurs");
          }}
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou une adresse"
            aria-label="Rechercher"
            className="h-11 w-72 rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
          />
        </form>
      </div>

      <p className="text-[13px] text-text-3">
        Un compte est créé automatiquement à la première connexion d&apos;une adresse autorisée, avec le rôle Agent.
      </p>

      <div className="hairline rounded-[16px] bg-bg-1">
        {users.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-text-2">Aucun compte ne correspond.</p>
        ) : (
          users.map((u) => {
            const fullName = `${u.first_name} ${u.last_name}`.trim();
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelected(u)}
                className={cn("flex w-full items-center gap-4 px-5 py-3 text-left", !u.is_active && "opacity-50")}
              >
                <Avatar name={fullName || u.email} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">{fullName || "Profil incomplet"}</span>
                  <span className="block truncate text-[13px] text-text-3">
                    {u.email}
                    {u.center && `, ${u.center.name}`}
                  </span>
                </span>
                <span className="hidden text-[13px] text-text-3 sm:block">{formatDateLong(u.created_at)}</span>
                <span className="text-[13px] font-medium text-text-2">{u.is_active ? ROLE_LABELS[u.role] : "Désactivé"}</span>
              </button>
            );
          })
        )}
      </div>

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected ? `${selected.first_name} ${selected.last_name}`.trim() || selected.email : ""}>
        {selected && (
          <div className="space-y-6 px-5 pb-8">
            <div className="text-[13px] text-text-3">
              <p>{selected.email}</p>
              <p>
                {selected.center?.name ?? "Centre non renseigné"}, compte créé le {formatDateLong(selected.created_at)}
              </p>
            </div>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">Rôle</p>
              <div className="flex gap-2">
                {(["reader", "editor", "admin"] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={pending || (selected.id === meId && r !== "admin")}
                    onClick={() => {
                      setSelected({ ...selected, role: r });
                      run(() => setUserRole(selected.id, r), `Rôle : ${ROLE_LABELS[r]}`);
                    }}
                    className={cn(
                      "h-9 rounded-full px-4 text-[13px] font-medium disabled:opacity-40",
                      selected.role === r ? "bg-bg-1 text-text-1 ring-1 ring-glass-edge" : "text-text-2 hover:text-text-1",
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-text-3">Agent : lit et réagit. Éditeur : publie et modère. Administrateur : gère aussi les comptes.</p>
            </section>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">Accès</p>
              <Button
                variant="secondary"
                size="md"
                disabled={pending || selected.id === meId}
                onClick={() => {
                  const next = !selected.is_active;
                  setSelected({ ...selected, is_active: next });
                  run(() => setUserActive(selected.id, next), next ? "Compte réactivé" : "Compte désactivé");
                }}
              >
                {selected.is_active ? "Désactiver le compte" : "Réactiver le compte"}
              </Button>
              <p className="text-[13px] text-text-3">Un compte désactivé est déconnecté à sa prochaine action et ne peut plus se connecter.</p>
            </section>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">Données personnelles</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="md" disabled={pending} onClick={() => exportJson(selected)}>
                  Exporter les données
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  disabled={pending || selected.id === meId}
                  onClick={() => {
                    if (window.confirm(`Supprimer définitivement le compte de ${selected.email} ? Ses commentaires seront anonymisés, ses réactions et favoris effacés.`)) {
                      run(() => deleteUser(selected.id), "Compte supprimé", true);
                    }
                  }}
                >
                  Supprimer le compte
                </Button>
              </div>
            </section>
          </div>
        )}
      </Sheet>
    </div>
  );
}
