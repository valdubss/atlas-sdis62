import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { ROLE_LABELS } from "@/lib/config";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";

const NAV = [
  { href: "/studio", label: "Tableau de bord" },
  { href: "/studio/posts", label: "Publications" },
  { href: "/studio/stories", label: "Stories" },
  { href: "/studio/moderation", label: "Modération" },
  { href: "/studio/parametres", label: "Paramètres" },
];

/**
 * Layout du studio (optimisé desktop). Le middleware filtre déjà sur le rôle
 * lu dans le JWT ; on revérifie ici en base (source de vérité).
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  if (!isEditorRole(current.profile.role)) redirect("/?erreur=acces-studio");

  const { profile } = current;

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="glass hidden w-64 shrink-0 flex-col border-y-0 border-l-0 md:flex">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Logo height={22} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-text">Studio</p>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Navigation du studio">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-body hover:bg-surface-2 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4 text-sm">
          <p className="truncate font-semibold text-ink">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-xs text-muted">{ROLE_LABELS[profile.role]}</p>
          <Link href="/" className="mt-2 inline-block text-xs font-semibold text-navy hover:underline">
            ← Retour au fil
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass flex h-16 items-center justify-between border-x-0 border-t-0 px-4 md:hidden">
          <Logo height={22} />
          <Link href="/" className="text-sm font-semibold text-navy">
            Retour au fil
          </Link>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
