import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { SettingsPanel } from "@/components/studio/SettingsPanel";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

type Stats = { subscribers: number; devices: number; digest_recipients: number; pending: number; sent_7d: number };

export default async function ParametresPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const supabase = await createClient();
  const [{ data: settings }, { data: stats }] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", ["digest_enabled", "app_name"]),
    supabase.rpc("get_notification_stats"),
  ]);
  const digestEnabled = settings?.find((s) => s.key === "digest_enabled")?.value === true;

  return (
    <SettingsPanel
      isAdmin={current.profile.role === "admin"}
      digestEnabled={digestEnabled}
      stats={(stats ?? { subscribers: 0, devices: 0, digest_recipients: 0, pending: 0, sent_7d: 0 }) as unknown as Stats}
      emailConfigured={Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST)}
      pushConfigured={Boolean(process.env.VAPID_PRIVATE_KEY)}
    />
  );
}
