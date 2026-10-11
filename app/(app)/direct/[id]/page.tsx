import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { fetchLive, fetchLiveEntries } from "@/lib/direct/queries";
import { TopBar } from "@/components/layout/TopBar";
import { LivePlayer } from "@/components/direct/LivePlayer";
import { LiveTimeline } from "@/components/direct/LiveTimeline";
import { LiveComposer } from "@/components/direct/LiveComposer";
import { LiveControls } from "@/components/direct/LiveControls";
import { LiveHeader } from "@/components/direct/LiveHeader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const live = await fetchLive(id);
  return { title: live ? `Direct · ${live.title}` : "Direct" };
}

/** Page d'un Direct : vidéo, fil minute par minute en temps réel, commandes du service com. */
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const [live, entries] = await Promise.all([fetchLive(id), fetchLiveEntries(id)]);
  if (!live) notFound();
  const canEdit = isEditorRole(current.profile.role);
  const active = live.status === "live";
  const date = live.started_at ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(live.started_at)) : null;

  return (
    <div className="space-y-3">
      <TopBar
        title="Direct"
        leading={
          <Link href={canEdit && live.status === "draft" ? "/studio/direct" : "/"} className="pressable -ml-2 flex h-12 items-center pr-2 text-[15px] font-medium text-text-2 hover:text-text-1">
            {canEdit && live.status === "draft" ? "Studio" : "Fil"}
          </Link>
        }
      />
      {live.video && live.status !== "draft" && (
        <div className="-mx-3 sm:mx-0">
          <LivePlayer active={active} />
        </div>
      )}
      <LiveHeader live={live} userId={current.profile.id} />
      <div className="px-1">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-text-1">{live.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-3">
          {date && <span>{date}</span>}
          {(live.location || live.center) && (
            <span className="flex items-center gap-1">
              <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
              {[live.location, live.center?.name].filter(Boolean).join(" · ")}
            </span>
          )}
        </p>
      </div>
      {live.status === "ended" && live.recap_slug && (
        <Link href={`/post/${live.recap_slug}`} className="pressable flex items-center justify-between rounded-[16px] bg-bg-1 px-4 py-3 text-[15px] text-text-1">
          Lire le récapitulatif du direct
          <span className="text-text-3">→</span>
        </Link>
      )}
      {canEdit && <LiveControls live={live} />}
      {canEdit && active && <LiveComposer liveId={live.id} />}
      <LiveTimeline liveId={live.id} initial={entries} canEdit={canEdit} active={active} />
    </div>
  );
}
