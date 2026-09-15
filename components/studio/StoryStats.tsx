import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { REACTIONS } from "@/lib/config";

export type StoryStatsData = {
  since: string;
  totals: { stories: number; views: number; completed: number; advanced: number; reactions: number; answers: number };
  stories: {
    id: string;
    series_title: string | null;
    text: string | null;
    published_at: string;
    status: string;
    views: number;
    completed: number;
    advanced: number;
    reactions: Record<string, number>;
    poll_votes: number;
    answers: number;
    replies: number;
  }[];
};

/** Studio → Statistiques → Stories : vues, complétion, passage à la suivante, réactions, réponses. */
export function StoryStats({ s }: { s: StoryStatsData }) {
  if (s.stories.length === 0) return null;
  const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)} %` : "—");
  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
        Stories <span className="text-text-3">{s.stories.length}</span>
      </h2>
      <p className="text-[13px] text-text-3">
        Vues : une par agent. Complétion : story regardée jusqu&apos;au bout. Passage : agents ayant tapé pour passer à la suivante avant la fin. Réactions et réponses ne sont visibles qu&apos;ici.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Vues", s.totals.views, `${s.totals.stories} stor${s.totals.stories > 1 ? "ies" : "y"}`],
          ["Complétion", pct(s.totals.completed, s.totals.views), `${s.totals.completed} vues complètes`],
          ["Passage à la suivante", pct(s.totals.advanced, s.totals.views), `${s.totals.advanced} passages`],
          ["Réactions", s.totals.reactions, `${s.totals.answers} réponse${s.totals.answers > 1 ? "s" : ""} aux questions`],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="rounded-[16px] bg-bg-1 px-4 py-4">
            <p className="text-[13px] text-text-2">{label}</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-1">{value}</p>
            <p className="text-[12px] text-text-3">{hint}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-[16px] bg-bg-1">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-text-3">
              <th className="px-5 py-3 font-medium">Story</th>
              <th className="px-3 py-3 font-medium">Mise en ligne</th>
              <th className="px-3 py-3 text-right font-medium">Vues</th>
              <th className="px-3 py-3 text-right font-medium">Complétion</th>
              <th className="px-3 py-3 text-right font-medium">Passage</th>
              <th className="px-3 py-3 text-right font-medium">Réactions</th>
              <th className="px-5 py-3 text-right font-medium">Sondage / réponses</th>
            </tr>
          </thead>
          <tbody className="text-text-1">
            {s.stories.map((r) => {
              const reactions = REACTIONS.map((k) => ({ ...k, n: r.reactions?.[k.kind] ?? 0 })).filter((k) => k.n > 0);
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="max-w-[280px] truncate px-5 py-2.5">
                    <Link href={`/studio/stories/${r.id}`} className="hover:text-navy-link">
                      {r.series_title ?? "Sans série"}
                      {r.text && <span className="text-text-2"> — {r.text}</span>}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-text-2">{formatDateTime(r.published_at)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.views}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.completed, r.views)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.advanced, r.views)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" title={reactions.map((k) => `${k.label} ${k.n}`).join(", ")}>
                    {reactions.length === 0 ? "—" : reactions.map((k) => `${k.emoji} ${k.n}`).join(" ")}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-text-2">
                    {r.poll_votes > 0 && `${r.poll_votes} vote${r.poll_votes > 1 ? "s" : ""}`}
                    {r.poll_votes > 0 && (r.answers > 0 || r.replies > 0) && " · "}
                    {r.answers + r.replies > 0 && `${r.answers + r.replies} réponse${r.answers + r.replies > 1 ? "s" : ""}`}
                    {r.poll_votes === 0 && r.answers + r.replies === 0 && "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
