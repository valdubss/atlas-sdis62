import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, CalendarDays, ChevronRight, Flame, Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { PageHeader } from "@/components/layout/PageHeader";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/config";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";
import { NotificationCenter } from "@/components/profile/NotificationCenter";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const { profile } = current;

  const supabase = await createClient();
  const [{ data: settings }, { count: subCount }, home] = await Promise.all([
    supabase.from("user_settings").select("push_new_posts, push_pinned, push_center, push_agenda, push_messages, quiet_start, quiet_end, hide_preview, digest_email").eq("user_id", profile.id).maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    profile.center_id
      ? supabase.from("centers").select("name").eq("id", profile.center_id).maybeSingle().then((r) => r.data?.name ?? null)
      : profile.service_id
        ? supabase.from("services").select("name").eq("id", profile.service_id).maybeSingle().then((r) => r.data?.name ?? null)
        : Promise.resolve(null),
  ]);
  const prefs = {
    push_new_posts: settings?.push_new_posts ?? true,
    push_pinned: settings?.push_pinned ?? true,
    push_center: settings?.push_center ?? true,
    push_agenda: settings?.push_agenda ?? true,
    push_messages: settings?.push_messages ?? ("all" as const),
    digest_email: settings?.digest_email ?? true,
    quiet_start: (settings?.quiet_start ?? "21:00").slice(0, 5),
    quiet_end: (settings?.quiet_end ?? "07:00").slice(0, 5),
    hide_preview: settings?.hide_preview ?? false,
  };
  const isReferent = profile.role === "referent";

  const incomplete = !profile.first_name || !profile.last_name;
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();

  return (
    <div className="space-y-3">
      <PageHeader title="Profil" />

      <section className="flex items-center gap-4 rounded-[16px] bg-bg-1 px-5 py-4">
        <AvatarUploader name={fullName || profile.email} avatarKey={profile.avatar_key} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-text-1">{incomplete ? "Bienvenue" : fullName}</p>
          <p className="truncate text-[13px] text-text-3">{profile.email}</p>
          <p className="text-[13px] text-text-2">{ROLE_LABELS[profile.role]}</p>
        </div>
      </section>

      {incomplete && (
        <p role="status" className="rounded-[16px] bg-bg-1 px-5 py-3 text-[15px] text-text-2">
          Complétez votre prénom et votre nom : ils apparaissent dans vos commentaires.
        </p>
      )}

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <ProfileForm profile={profile} />
      </section>

      <div className="hairline rounded-[16px] bg-bg-1">
        <Link href="/profil/centre" className="pressable flex min-h-12 items-center justify-between gap-3 px-5 py-2 text-[15px] text-text-1">
          <span className="flex min-w-0 items-center gap-3">
            <Flame size={20} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">Mon centre</span>
              <span className="block truncate text-[13px] text-text-3">{home ?? "Rattachement à renseigner"}</span>
            </span>
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-text-3" />
        </Link>
        {isReferent && (
          <Link href="/profil/propositions" className="pressable flex h-12 items-center justify-between px-5 text-[15px] text-text-1">
            <span className="flex items-center gap-3">
              <Inbox size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
              Mes propositions
            </span>
            <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
          </Link>
        )}
        <Link href="/agenda" className="pressable flex h-12 items-center justify-between px-5 text-[15px] text-text-1">
          <span className="flex items-center gap-3">
            <CalendarDays size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
            Agenda
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
        </Link>
        <Link href="/favoris" className="pressable flex h-12 items-center justify-between px-5 text-[15px] text-text-1">
          <span className="flex items-center gap-3">
            <Bookmark size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
            Favoris
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
        </Link>
      </div>

      {isEditorRole(profile.role) && (
        <Link href="/studio" className="pressable flex items-center justify-between rounded-[16px] bg-bg-1 px-5 py-4">
          <span>
            <span className="block text-[15px] text-text-1">Studio</span>
            <span className="block text-[13px] text-text-3">Publier et modérer les contenus</span>
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
        </Link>
      )}

      <section className="rounded-[16px] bg-bg-1 py-3">
        <h2 className="px-5 pb-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Notifications</h2>
        <NotificationCenter prefs={prefs} hasSubscriptions={(subCount ?? 0) > 0} />
      </section>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Mot de passe</h2>
        <p className="mb-4 mt-1 text-[13px] text-text-3">Facultatif : permet de se connecter sans attendre le lien par e-mail.</p>
        <PasswordForm />
      </section>

      <div className="hairline rounded-[16px] bg-bg-1">
        <Link href="/profil/signaler" className="pressable flex h-12 items-center justify-between px-5 text-[15px] text-text-1">
          Signaler un problème
          <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
        </Link>
        <Link href="/a-propos" className="pressable flex h-12 items-center justify-between px-5 text-[15px] text-text-1">
          À propos, charte et données personnelles
          <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
        </Link>
        <form action={signOut} className="px-5 py-2">
          <Button type="submit" variant="tertiary" className="w-full">
            Se déconnecter
          </Button>
        </form>
      </div>
    </div>
  );
}
