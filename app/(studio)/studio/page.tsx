import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

type Stats = {
  drafts: number;
  scheduled: number;
  published: number;
  week: { posts: number; reactions: number; comments: number; views: number };
  top: { id: string; slug: string; title: string | null; type: string; published_at: string; reactions: number; comments: number; views: number }[];
};

export default async function StudioDashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("studio_stats");
  const stats = (data ?? { drafts: 0, scheduled: 0, published: 0, week: { posts: 0, reactions: 0, comments: 0, views: 0 }, top: [] }) as unknown as Stats;

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Tableau de bord</h1>
        <Link href="/studio/posts/new" className="pressable flex h-11 items-center rounded-[12px] bg-red-fill px-4 text-[15px] font-semibold text-white">
          Nouvelle publication
        </Link>
      </div>

      <section className="grid grid-cols-3 gap-3">
        {[
          ["Brouillons", stats.drafts, "/studio/posts?statut=draft"],
          ["Programmées", stats.scheduled, "/studio/posts?statut=scheduled"],
          ["Publiées", stats.published, "/studio/posts?statut=published"],
        ].map(([label, value, href]) => (
          <Link key={String(label)} href={String(href)} className="pressable rounded-[16px] bg-bg-1 px-4 py-4 sm:px-5">
            <p className="text-[13px] text-text-2">{label}</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-1 sm:text-[28px]">{value}</p>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Sept derniers jours</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Publications", stats.week.posts],
            ["Vues", stats.week.views],
            ["Réactions", stats.week.reactions],
            ["Commentaires", stats.week.comments],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[16px] bg-bg-1 px-5 py-4">
              <p className="text-[13px] text-text-2">{label}</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-text-1">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Top 5 de la semaine</h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {stats.top.length === 0 ? (
            <p className="px-5 py-8 text-center text-[15px] text-text-2">Pas encore de publication cette semaine.</p>
          ) : (
            stats.top.map((p, i) => (
              <Link key={p.id} href={`/studio/posts/${p.id}`} className="pressable flex items-center gap-4 px-5 py-3 sm:h-[52px] sm:py-0">
                <span className="w-5 shrink-0 text-[15px] tabular-nums text-text-3">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">{p.title ?? "Sans titre"}</span>
                  <span className="block truncate text-[13px] text-text-3">
                    {formatRelative(p.published_at)}
                    <span className="sm:hidden">
                      {" "}· {p.views} vues · {p.reactions} réactions · {p.comments} commentaires
                    </span>
                  </span>
                </span>
                <span className="hidden shrink-0 gap-4 text-[13px] tabular-nums text-text-2 sm:flex">
                  <span>{p.views} vues</span>
                  <span>{p.reactions} réactions</span>
                  <span>{p.comments} commentaires</span>
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
