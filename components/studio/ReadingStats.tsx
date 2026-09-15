import Link from "next/link";
import { formatDateTime } from "@/lib/format";

export type ReadingStatsData = {
  totals: { viewed: number; read: number; interacted: number };
  posts: { post_id: string; title: string | null; type: string; published_at: string; viewed: number; read: number; interacted: number }[];
};

const TYPE: Record<string, string> = { photo: "Photos", video: "Vidéo", text: "Annonce", article: "Article", poll: "Sondage" };

/** Studio → Statistiques → Lecture : affichage, lecture qualifiée, interaction. */
export function ReadingStats({ s }: { s: ReadingStatsData }) {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Lecture</h2>
      <p className="text-[13px] text-text-3">Affichage : la carte est passée à l&apos;écran. Lecture : visible à moitié pendant 2 s, ou article parcouru à 80 %. Interaction : réaction, commentaire, favori ou vote.</p>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Affichages", s.totals.viewed, ""],
          ["Lectures", s.totals.read, pct(s.totals.read, s.totals.viewed)],
          ["Interactions", s.totals.interacted, pct(s.totals.interacted, s.totals.viewed)],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="rounded-[16px] bg-bg-1 px-4 py-4">
            <p className="text-[13px] text-text-2">{label}</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-1">{value}</p>
            <p className="text-[12px] text-text-3">{hint}</p>
          </div>
        ))}
      </div>
      {s.posts.length > 0 && (
        <div className="overflow-x-auto rounded-[16px] bg-bg-1">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="px-5 py-3 font-medium">Publication</th>
                <th className="px-3 py-3 font-medium">Mise en ligne</th>
                <th className="px-3 py-3 text-right font-medium">Affichée</th>
                <th className="px-3 py-3 text-right font-medium">Lue</th>
                <th className="px-5 py-3 text-right font-medium">Interaction</th>
              </tr>
            </thead>
            <tbody className="text-text-1">
              {s.posts.map((p) => (
                <tr key={p.post_id} className="border-t border-line">
                  <td className="max-w-[320px] truncate px-5 py-2.5">
                    <Link href={`/studio/posts/${p.post_id}`} className="hover:text-navy-link">
                      {p.title ?? "Sans titre"}
                    </Link>
                    <span className="text-text-3"> · {TYPE[p.type] ?? p.type}</span>
                  </td>
                  <td className="px-3 py-2.5 text-text-2">{formatDateTime(p.published_at)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.viewed}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {p.read} <span className="text-text-3">({pct(p.read, p.viewed)})</span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {p.interacted} <span className="text-text-3">({pct(p.interacted, p.viewed)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
