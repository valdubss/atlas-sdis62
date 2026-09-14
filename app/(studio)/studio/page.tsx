import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EcgDivider } from "@/components/brand/Ecg";
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Tableau de bord</SectionTitle>
        <Link href="/studio/posts/new" className="rounded-xl bg-red px-4 py-2.5 text-sm font-bold text-white hover:bg-red-hover">
          + Nouvelle publication
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Brouillons", stats.drafts, "/studio/posts?statut=draft"],
          ["Programmées", stats.scheduled, "/studio/posts?statut=scheduled"],
          ["Publiées", stats.published, "/studio/posts?statut=published"],
        ].map(([label, value, href]) => (
          <Link key={String(label)} href={String(href)}>
            <Card className="p-5 transition-shadow hover:shadow-lg">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1 font-display text-4xl font-extrabold text-ink">{value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <EcgDivider />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold uppercase text-ink">7 derniers jours</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Publications", stats.week.posts],
            ["Vues", stats.week.views],
            ["Réactions", stats.week.reactions],
            ["Commentaires", stats.week.comments],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-ink">{value}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold uppercase text-ink">Top 5 de la semaine</h2>
        <Card className="divide-y divide-line">
          {stats.top.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Pas encore de publication cette semaine.</p>
          ) : (
            stats.top.map((p, i) => (
              <Link key={p.id} href={`/studio/posts/${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                <span className="font-display text-2xl font-extrabold text-red">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{p.title ?? "Sans titre"}</p>
                  <p className="text-xs text-muted">{formatRelative(p.published_at)}</p>
                </div>
                <div className="flex gap-3 text-xs text-muted">
                  <span>👁 {p.views}</span>
                  <span>👏 {p.reactions}</span>
                  <span>💬 {p.comments}</span>
                </div>
              </Link>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
