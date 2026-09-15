import Link from "next/link";
import { formatDateTime } from "@/lib/format";

export type VideoStatRow = { post_id: string; title: string | null; slug: string; published_at: string; views: number; p25: number; p50: number; p75: number; p100: number };

/** Studio → Statistiques → Vidéos : paliers de lecture par vidéo (25 / 50 / 75 / 100 %). */
export function VideoStats({ rows }: { rows: VideoStatRow[] }) {
  if (rows.length === 0) return null;
  const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)} %` : "—");
  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
        Vidéos <span className="text-text-3">{rows.length}</span>
      </h2>
      <p className="text-[13px] text-text-3">Part des agents ayant regardé au moins un quart, la moitié, les trois quarts et la totalité de la vidéo.</p>
      <div className="overflow-x-auto rounded-[16px] bg-bg-1">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-text-3">
              <th className="px-5 py-3 font-medium">Vidéo</th>
              <th className="px-3 py-3 font-medium">Mise en ligne</th>
              <th className="px-3 py-3 text-right font-medium">Vues</th>
              <th className="px-3 py-3 text-right font-medium">25 %</th>
              <th className="px-3 py-3 text-right font-medium">50 %</th>
              <th className="px-3 py-3 text-right font-medium">75 %</th>
              <th className="px-5 py-3 text-right font-medium">100 %</th>
            </tr>
          </thead>
          <tbody className="text-text-1">
            {rows.map((r) => (
              <tr key={r.post_id} className="border-t border-line">
                <td className="max-w-[320px] truncate px-5 py-2.5">
                  <Link href={`/studio/posts/${r.post_id}`} className="hover:text-navy-link">
                    {r.title ?? "Sans titre"}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-text-2">{formatDateTime(r.published_at)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.views}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.p25, r.views)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.p50, r.views)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.p75, r.views)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{pct(r.p100, r.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
