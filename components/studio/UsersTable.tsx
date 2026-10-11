"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteUser,
  exportUserData,
  sendLoginEmail,
  sendPasswordReset,
  setUserPassword,
  setUserActive,
  setUserRole,
  updateUserProfile,
  bulkUsers,
} from "@/app/(admin)/admin/utilisateurs/actions";
import Link from "next/link";
import { Field, SelectField } from "@/components/ui/Field";
import type { UserRole } from "@/lib/supabase/database.types";
import { ROLE_LABELS } from "@/lib/config";
import { formatDateLong } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { CreateUserForm } from "./CreateUserForm";
import { CheckSquare, ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, Square, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/Confirm";

export type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  onboarded_at: string | null;
  center_id: string | null;
  service_id: string | null;
  center: { name: string } | null;
  service: { name: string } | null;
  /** Dernière connexion réelle (auth), quand la page l'a demandée */
  last_sign_in_at?: string | null;
};

type Ref = { id: string; name: string };

/**
 * Gestion des comptes (administrateur) : rôle, désactivation, export et
 * suppression RGPD. Liste aérée à séparateurs, actions dans une sheet.
 */
export function UsersTable({
  users,
  meId,
  q,
  centers = [],
  services = [],
  basePath = "/admin/utilisateurs",
  page = 1,
  pageSize = 100,
  total,
  initialFilter,
}: {
  users: UserRow[];
  meId: string;
  q: string;
  centers?: Ref[];
  services?: Ref[];
  /** Adresse de la page (recherche, pagination) */
  basePath?: string;
  page?: number;
  pageSize?: number;
  /** Nombre total de comptes correspondant à la recherche (pagination côté serveur) */
  total?: number;
  initialFilter?: string;
}) {
  const router = useRouter();
  // Sélection pour les actions groupées (identifiants de la page courante)
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const pageHref = (n: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(n > 1 ? { page: String(n) } : {}) }).toString()}`;
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(q);
  const [pending, start] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const [identity, setIdentity] = useState({ first_name: "", last_name: "", target: "" });
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(true);

  /** Mot de passe lisible : lettres et chiffres sans caractères ambigus, 12 signes. */
  function generatePassword() {
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(12);
    crypto.getRandomValues(bytes);
    const core = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    setPwd(`${core.slice(0, 4)}-${core.slice(4, 8)}-${core.slice(8, 12)}`);
  }

  function applyPassword() {
    if (!selected) return;
    start(async () => {
      const r = await setUserPassword(selected.id, pwd);
      toast(r.ok ? `Mot de passe défini pour ${selected.email}` : r.error);
      if (r.ok) setPwd("");
    });
  }

  function select(u: UserRow | null) {
    setSelected(u);
    setPwd("");
    if (u) setIdentity({ first_name: u.first_name, last_name: u.last_name, target: u.center_id ? `c:${u.center_id}` : u.service_id ? `s:${u.service_id}` : "" });
  }

  function saveIdentity() {
    if (!selected) return;
    const [kind, id] = identity.target.split(":");
    start(async () => {
      const r = await updateUserProfile(selected.id, { first_name: identity.first_name, last_name: identity.last_name, center_id: kind === "c" ? id : "", service_id: kind === "s" ? id : "" });
      toast(r.ok ? "Profil enregistré" : r.error);
      if (r.ok) router.refresh();
    });
  }

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMessage: string,
    close = false,
    onFail?: () => void,
  ) {
    start(async () => {
      const res = await fn();
      toast(res.ok ? okMessage : (res.error ?? "Erreur"));
      if (res.ok && close) setSelected(null);
      if (!res.ok) onFail?.();
    });
  }

  type Filter = "all" | "admin" | "editor" | "reader" | "inactive" | "never";
  const [filter, setFilter] = useState<Filter>(() => (["all", "admin", "editor", "reader", "inactive", "never"].includes(initialFilter ?? "") ? (initialFilter as Filter) : "all"));
  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "Tous" },
    { id: "admin", label: "Administrateurs" },
    { id: "editor", label: "Éditeurs" },
    { id: "reader", label: "Agents" },
    { id: "never", label: "Jamais connectés" },
    { id: "inactive", label: "Désactivés" },
  ];
  const visible = users.filter((u) => {
    if (filter === "all") return true;
    if (filter === "inactive") return !u.is_active;
    if (filter === "never") return u.last_sign_in_at === undefined ? !u.onboarded_at : !u.last_sign_in_at;
    if (filter === "reader") return u.role === "reader" || u.role === "referent";
    return u.role === filter;
  });

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
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">
            Utilisateurs
          </h1>
          <p className="text-[13px] text-text-3">
            {total !== undefined && total > users.length ? `${total} comptes, page ${page} sur ${totalPages} · sur cette page : ` : `${users.length} comptes, `}
            {counts.admin} administrateurs, {counts.editor} éditeurs, {counts.reader} agents
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="pressable flex h-11 items-center gap-2 rounded-[12px] bg-red-fill px-4 text-[15px] font-semibold text-white"
          >
            <UserPlus size={18} strokeWidth={1.75} aria-hidden="true" />
            Créer un compte
          </button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(search.trim() ? `${basePath}?q=${encodeURIComponent(search.trim())}` : basePath);
            }}
          >
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un nom ou une adresse"
              aria-label="Rechercher"
              className="h-11 w-full min-w-0 rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge sm:w-72"
            />
          </form>
        </div>
      </div>

      <p className="text-[13px] text-text-3">Toute adresse @sdis62.fr crée son compte à sa première connexion, avec le rôle Agent. « Créer un compte » invite un agent et pose directement son rôle et son centre.</p>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Créer un compte"
      >
        {creating && <CreateUserForm onDone={() => setCreating(false)} centers={centers} />}
      </Sheet>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="Filtrer les comptes">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn("h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-medium", filter === f.id ? "bg-bg-2 text-text-1 ring-1 ring-glass-edge" : "bg-bg-1 text-text-2")}>
            {f.label}
          </button>
        ))}
      </div>

      {checked.size > 0 && (
        <div className="sticky top-[calc(48px+env(safe-area-inset-top)+8px)] z-20 flex flex-wrap items-center gap-2 rounded-[14px] bg-bg-2 px-3 py-2 ring-1 ring-glass-edge md:top-2">
          <span className="px-1 text-[13px] font-medium text-text-1">{checked.size} sélectionné{checked.size > 1 ? "s" : ""}</span>
          {([
            ["role_editor", "Passer éditeur"],
            ["role_reader", "Passer agent"],
            ["deactivate", "Désactiver"],
            ["activate", "Réactiver"],
          ] as const).map(([action, label]) => (
            <button
              key={action}
              type="button"
              disabled={pending}
              onClick={async () => {
                if (!(await confirm({ title: `${label} ${checked.size} compte${checked.size > 1 ? "s" : ""} ?`, confirmLabel: label, danger: action === "deactivate" }))) return;
                start(async () => {
                  const r = await bulkUsers({ ids: [...checked], action });
                  toast(r.ok ? `${r.done} compte${r.done > 1 ? "s" : ""} mis à jour${r.failed ? `, ${r.failed} en échec` : ""}` : r.error);
                  setChecked(new Set());
                  router.refresh();
                });
              }}
              className={cn("h-9 rounded-full px-3 text-[13px] font-medium", action === "deactivate" ? "bg-red-soft text-red-text" : "bg-bg-1 text-text-1")}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setChecked(new Set())} aria-label="Annuler la sélection" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-text-3 hover:text-text-1">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="hairline rounded-[16px] bg-bg-1">
        {visible.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 text-[13px] text-text-3">
            <button
              type="button"
              onClick={() => setChecked(checked.size === visible.length ? new Set() : new Set(visible.map((u) => u.id)))}
              aria-label={checked.size === visible.length ? "Tout désélectionner" : "Tout sélectionner"}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-2 hover:text-text-1"
            >
              {checked.size === visible.length ? <CheckSquare size={18} strokeWidth={1.75} aria-hidden="true" /> : <Square size={18} strokeWidth={1.75} aria-hidden="true" />}
            </button>
            <span>{visible.length} compte{visible.length > 1 ? "s" : ""} affiché{visible.length > 1 ? "s" : ""}</span>
          </div>
        )}
        {visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-text-2">
            Aucun compte ne correspond.
          </p>
        ) : (
          visible.map((u) => {
            const fullName = `${u.first_name} ${u.last_name}`.trim();
            const isChecked = checked.has(u.id);
            return (
              <div key={u.id} className={cn("flex items-center gap-2 pl-3", !u.is_active && "opacity-50", isChecked && "bg-bg-2/60")}>
                <button
                  type="button"
                  onClick={() => setChecked((prev) => { const next = new Set(prev); if (next.has(u.id)) next.delete(u.id); else next.add(u.id); return next; })}
                  aria-label={isChecked ? `Désélectionner ${fullName || u.email}` : `Sélectionner ${fullName || u.email}`}
                  aria-pressed={isChecked}
                  className="flex h-10 w-8 shrink-0 items-center justify-center rounded-[8px] text-text-3 hover:text-text-1"
                >
                  {isChecked ? <CheckSquare size={18} strokeWidth={1.75} aria-hidden="true" /> : <Square size={18} strokeWidth={1.75} aria-hidden="true" />}
                </button>
              <button
                type="button"
                onClick={() => select(u)}
                className="flex min-w-0 flex-1 items-center gap-4 py-3 pr-5 text-left"
              >
                <Avatar name={fullName || u.email} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">
                    {fullName || "Profil incomplet"}
                  </span>
                  <span className="block truncate text-[13px] text-text-3">
                    {u.email}
                    {u.center ? `, ${u.center.name}` : u.service ? `, ${u.service.name}` : ""}
                    {(u.last_sign_in_at === undefined ? !u.onboarded_at : !u.last_sign_in_at) && " · jamais connecté"}
                  </span>
                </span>
                <span className="hidden text-[13px] text-text-3 sm:block">
                  {formatDateLong(u.created_at)}
                </span>
                <span className="text-[13px] font-medium text-text-2">
                  {u.is_active ? ROLE_LABELS[u.role] : "Désactivé"}
                </span>
              </button>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 px-1 text-[13px] text-text-2" aria-label="Pagination">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="pressable flex h-10 items-center gap-1 rounded-[10px] bg-bg-1 px-3 font-medium text-text-1">
              <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" /> Précédents
            </Link>
          ) : <span />}
          <span className="tabular-nums">Page {page} sur {totalPages}</span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="pressable flex h-10 items-center gap-1 rounded-[10px] bg-bg-1 px-3 font-medium text-text-1">
              Suivants <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : <span />}
        </nav>
      )}

      <Sheet
        open={selected !== null}
        onClose={() => select(null)}
        title={
          selected
            ? `${selected.first_name} ${selected.last_name}`.trim() ||
              selected.email
            : ""
        }
      >
        {selected && (
          <div className="space-y-6 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <div className="text-[13px] text-text-3">
              <p>{selected.email}</p>
              <p>
                Compte créé le {formatDateLong(selected.created_at)}
                {selected.last_sign_in_at ? `, dernière connexion le ${formatDateLong(selected.last_sign_in_at)}` : selected.onboarded_at && selected.last_sign_in_at === undefined ? "" : ", jamais connecté"}
              </p>
            </div>

            <section className="space-y-3">
              <p className="text-[13px] font-medium text-text-2">Identité et rattachement</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prénom" name="first_name" value={identity.first_name} onChange={(e) => setIdentity((v) => ({ ...v, first_name: e.target.value }))} maxLength={60} />
                <Field label="Nom" name="last_name" value={identity.last_name} onChange={(e) => setIdentity((v) => ({ ...v, last_name: e.target.value }))} maxLength={60} />
              </div>
              <SelectField label="Centre ou service" name="target" value={identity.target} onChange={(e) => setIdentity((v) => ({ ...v, target: e.target.value }))} hint="Posé directement, sans validation par le chef de centre.">
                <option value="">Aucun</option>
                {centers.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.name}
                  </option>
                ))}
                {services.map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
              <Button variant="secondary" size="md" loading={pending} onClick={saveIdentity}>
                Enregistrer
              </Button>
            </section>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">Connexion</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="md" disabled={pending} onClick={() => run(() => sendLoginEmail(selected.id), `E-mail de connexion envoyé à ${selected.email}`)}>
                  {selected.onboarded_at ? "Renvoyer un e-mail de connexion" : "Renvoyer l'invitation"}
                </Button>
                <Button variant="secondary" size="md" disabled={pending} onClick={() => run(() => sendPasswordReset(selected.id), `E-mail de mot de passe envoyé à ${selected.email}`)}>
                  Réinitialiser le mot de passe
                </Button>
              </div>
              <p className="text-[13px] text-text-3">L&apos;agent reçoit un lien et un code valables quinze minutes ; le mot de passe, s&apos;il en veut un, se choisit dans son profil.</p>
            </section>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">Mot de passe (dépannage)</p>
              <div className="flex gap-2">
                <input
                  type={showPwd ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Nouveau mot de passe"
                  aria-label="Nouveau mot de passe"
                  className="block h-11 w-full min-w-0 flex-1 rounded-[10px] bg-bg-2 px-3.5 font-mono text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
                />
                <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? "Masquer" : "Afficher"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2">
                  {showPwd ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
                </button>
                <button type="button" onClick={generatePassword} aria-label="Proposer un mot de passe" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2">
                  <RefreshCw size={18} strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="md" loading={pending} disabled={pwd.length < 10} onClick={applyPassword}>
                  Définir le mot de passe
                </Button>
                <span className="text-[13px] text-text-3">10 caractères minimum. Transmettez-le à l&apos;agent ; il pourra le changer dans son profil.</span>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">Rôle</p>
              <div className="flex gap-2">
                {(["reader", "editor", "admin"] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={
                      pending || (selected.id === meId && r !== "admin")
                    }
                    onClick={() => {
                      const before = selected;
                      setSelected({ ...selected, role: r });
                      run(
                        () => setUserRole(selected.id, r),
                        `Rôle : ${ROLE_LABELS[r]}`,
                        false,
                        () => setSelected(before),
                      );
                    }}
                    className={cn(
                      "h-9 rounded-full px-4 text-[13px] font-medium disabled:opacity-40",
                      selected.role === r
                        ? "bg-bg-1 text-text-1 ring-1 ring-glass-edge"
                        : "text-text-2 hover:text-text-1",
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-text-3">
                Agent : lit et réagit. Éditeur : publie et modère.
                Administrateur : gère aussi les comptes.
              </p>
            </section>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">Accès</p>
              <Button
                variant="secondary"
                size="md"
                disabled={pending || selected.id === meId}
                onClick={() => {
                  const next = !selected.is_active;
                  const before = selected;
                  setSelected({ ...selected, is_active: next });
                  run(
                    () => setUserActive(selected.id, next),
                    next ? "Compte réactivé" : "Compte désactivé",
                    false,
                    () => setSelected(before),
                  );
                }}
              >
                {selected.is_active
                  ? "Désactiver le compte"
                  : "Réactiver le compte"}
              </Button>
              <p className="text-[13px] text-text-3">
                Un compte désactivé est déconnecté à sa prochaine action et ne
                peut plus se connecter.
              </p>
            </section>

            <section className="space-y-2">
              <p className="text-[13px] font-medium text-text-2">
                Données personnelles
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  disabled={pending}
                  onClick={() => exportJson(selected)}
                >
                  Exporter les données
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  disabled={pending || selected.id === meId}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Supprimer le compte de ${selected.email} ?`,
                        message: "Définitif : ses commentaires seront anonymisés, ses réactions et favoris effacés.",
                        confirmLabel: "Supprimer définitivement",
                        danger: true,
                      })
                    ) {
                      run(
                        () => deleteUser(selected.id),
                        "Compte supprimé",
                        true,
                      );
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
