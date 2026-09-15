import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CenterStats, type CenterStatsData } from "@/components/studio/CenterStats";
import { VideoStats, type VideoStatRow } from "@/components/studio/VideoStats";
import { NotificationStats, type NotificationStatsData } from "@/components/studio/NotificationStats";
import { ReadingStats, type ReadingStatsData } from "@/components/studio/ReadingStats";

export const metadata: Metadata = { title: "Statistiques" };
export const dynamic = "force-dynamic";

export type Stats = {
  since: string;
  agents: number;
  active_agents: number;
  subscribers: number;
  totals: { posts: number; views: number; reactions: number; comments: number; bookmarks: number; story_views: number; push_sent: number };
  by_hour: { hour: number; views: number }[];
  by_weekday: { dow: number; views: number }[];
  posts: { id: string; slug: string; title: string | null; type: string; published_at: string; views: number; reactions: number; comments: number; bookmarks: number }[];
};

const PERIODS = [7, 30, 90];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const TYPES: Record<string, string> = { photo: "Photos", video: "Vidéo", text: "Annonce", article: "Article", poll: "Sondage" };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ jours?: string }> }) {
  const { jours } = await searchParams;
  const days = PERIODS.includes(Number(jours)) ? Number(jours) : 30;
  const supabase = await createClient();
  const [{ data }, { data: centerData }, { data: videoData }, { data: notifData }, { data: readingData }] = await Promise.all([supabase.rpc("studio_post_stats", { p_days: days }), supabase.rpc("studio_center_stats", { p_days: days }), supabase.rpc("studio_video_stats", { p_days: days }), supabase.rpc("studio_notification_stats", { p_days: days }), supabase.rpc("studio_reading_stats", { p_days: days })]);
  const s = (data ?? null) as unknown as Stats | null;
  const cs = (centerData ?? null) as unknown as CenterStatsData | null;
  const vs = ((videoData ?? []) as unknown as VideoStatRow[]) ?? [];
  const ns = (notifData ?? null) as unknown as NotificationStatsData | null;
  const rs = (readingData ?? null) as unknown as ReadingStatsData | null;
  if (!s) return <p className="text-[15px] text-text-2">Statistiques indisponibles.</p>;

  const hours = Array.from({ length: 24 }, (_, h) => s.by_hour.find((x) => x.hour === h)?.views ?? 0);
  const maxHour = Math.max(1, ...hours);
  const dows = Array.from({ length: 7 }, (_, i) => s.by_weekday.find((x) => x.dow === i + 1)?.views ?? 0);
  const maxDow = Math.max(1, ...dows);
  const reach = s.agents ? Math.round((s.active_agents / s.agents) * 100) : 0;

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Statistiques</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-bg-1 p-1" role="tablist" aria-label="Période">
            {PERIODS.map((p) => (
              <Link key={p} href={`/studio/statistiques?jours=${p}`} role="tab" aria-selected={p === days} className={cn("rounded-full px-3 py-1.5 text-[13px] font-medium", p === days ? "bg-bg-2 text-text-1" : "text-text-2")}>
                {p} j
              </Link>
            ))}
          </div>
          <a href={`/studio/statistiques/export?jours=${days}`} className="pressable rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] font-medium text-text-1">
            Export CSV
          </a>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Agents ayant lu", `${s.active_agents} / ${s.agents}`, `${reach} % des comptes actifs`],
          ["Vues de publications", s.totals.views, `${s.totals.posts} publication${s.totals.posts > 1 ? "s" : ""} en ligne`],
          ["Réactions", s.totals.reactions, `${s.totals.comments} commentaire${s.totals.comments > 1 ? "s" : ""}`],
          ["Notifications push", s.totals.push_sent, `${s.subscribers} agent${s.subscribers > 1 ? "s" : ""} abonné${s.subscribers > 1 ? "s" : ""}`],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="rounded-[16px] bg-bg-1 px-4 py-4">
            <p className="text-[13px] text-text-2">{label}</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-1">{value}</p>
            <p className="text-[12px] text-text-3">{hint}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[16px] bg-bg-1 p-5">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Heures de lecture</h2>
          <p className="text-[13px] text-text-3">Vues de publications par heure (heure de Paris)</p>
          <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label="Répartition des lectures par heure">
            {hours.map((v, h) => (
              <div key={h} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${h} h : ${v}`}>
                <div className="w-full rounded-t-[3px] bg-navy-link" style={{ height: `${Math.max(2, (v / maxHour) * 100)}%`, opacity: v ? 1 : 0.25 }} />
                {h % 6 === 0 && <span className="text-[10px] text-text-4">{h}h</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[16px] bg-bg-1 p-5">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Jours de lecture</h2>
          <p className="text-[13px] text-text-3">Vues de publications par jour de la semaine</p>
          <div className="mt-4 flex h-32 items-end gap-2" role="img" aria-label="Répartition des lectures par jour">
            {dows.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${DAYS[i]} : ${v}`}>
                <div className="w-full rounded-t-[4px] bg-navy-link" style={{ height: `${Math.max(2, (v / maxDow) * 100)}%`, opacity: v ? 1 : 0.25 }} />
                <span className="text-[10px] text-text-4">{DAYS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {rs?.totals && <ReadingStats s={rs} />}
      <VideoStats rows={vs} />
      {ns?.by_kind && <NotificationStats s={ns} />}
      {cs && <CenterStats s={cs} days={days} />}

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          Publications <span className="text-text-3">{s.posts.length}</span>
        </h2>
        <div className="overflow-x-auto rounded-[16px] bg-bg-1">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="px-5 py-3 font-medium">Publication</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Mise en ligne</th>
                <th className="px-3 py-3 text-right font-medium">Vues</th>
                <th className="px-3 py-3 text-right font-medium">Réactions</th>
                <th className="px-3 py-3 text-right font-medium">Comm.</th>
                <th className="px-5 py-3 text-right font-medium">Favoris</th>
              </tr>
            </thead>
            <tbody className="text-text-1">
              {s.posts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-text-2">
                    Aucune publication sur la période.
                  </td>
                </tr>
              ) : (
                s.posts.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="max-w-[320px] truncate px-5 py-2.5">
                      <Link href={`/studio/posts/${p.id}`} className="hover:text-navy-link">
                        {p.title ?? "Sans titre"}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-text-2">{TYPES[p.type] ?? p.type}</td>
                    <td className="px-3 py-2.5 text-text-2">{formatDateTime(p.published_at)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.views}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.reactions}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.comments}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{p.bookmarks}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-text-4">Vues : une par agent et par publication. Depuis le {formatDateTime(s.since)}.</p>
      </section>
    </div>
  );
}
