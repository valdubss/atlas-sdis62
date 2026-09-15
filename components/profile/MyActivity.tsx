import Link from "next/link";
import { REACTIONS } from "@/lib/config";
import { formatRelative } from "@/lib/format";

export type MyActivityData = {
  reactions: number;
  bookmarks: number;
  comments: number;
  proposals: number;
  messages: number;
  story_reactions: number;
  recent_reactions: { post_id: string; slug: string; title: string | null; kind: string; at: string }[];
  recent_comments: { post_id: string; slug: string; title: string | null; body: string; at: string }[];
};

/** Profil → Mon activité : compteurs et derniers gestes (réactions, commentaires). */
export function MyActivity({ a, canMessage, isReferent }: { a: MyActivityData; canMessage: boolean; isReferent: boolean }) {
  const emoji = (kind: string) => REACTIONS.find((r) => r.kind === kind)?.emoji ?? "👏";
  const tiles: [string, number, string][] = [
    ["Réactions", a.reactions + a.story_reactions, "/favoris"],
    ["Commentaires", a.comments, "/"],
    ["Favoris", a.bookmarks, "/favoris"],
    ...(isReferent ? ([["Propositions", a.proposals, "/profil/propositions"]] as [string, number, string][]) : []),
    ...(canMessage ? ([["Messages", a.messages, "/messages"]] as [string, number, string][]) : []),
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, n, href]) => (
          <Link key={label} href={href} className="pressable rounded-[16px] bg-bg-1 px-4 py-4">
            <p className="text-[24px] font-semibold tracking-[-0.02em] text-text-1">{n}</p>
            <p className="text-[13px] text-text-2">{label}</p>
          </Link>
        ))}
      </div>
      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Dernières réactions</h2>
        <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
          {a.recent_reactions.length === 0 && <li className="px-4 py-5 text-center text-[15px] text-text-2">Aucune réaction pour le moment.</li>}
          {a.recent_reactions.map((r) => (
            <li key={`${r.post_id}-${r.at}`}>
              <Link href={`/post/${r.slug}`} className="pressable flex items-center gap-3 px-4 py-2.5">
                <span className="text-[20px]">{emoji(r.kind)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">{r.title ?? "Publication"}</span>
                  <span className="block text-[12px] text-text-3">{formatRelative(r.at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Derniers commentaires</h2>
        <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
          {a.recent_comments.length === 0 && <li className="px-4 py-5 text-center text-[15px] text-text-2">Aucun commentaire pour le moment.</li>}
          {a.recent_comments.map((c) => (
            <li key={`${c.post_id}-${c.at}`}>
              <Link href={`/post/${c.slug}`} className="pressable block px-4 py-2.5">
                <span className="block truncate text-[13px] text-text-3">
                  {c.title ?? "Publication"} · {formatRelative(c.at)}
                </span>
                <span className="block truncate text-[15px] text-text-1">{c.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="px-1 text-[12px] text-text-4">Ces données vous concernent seulement ; le service communication ne voit que des totaux anonymes dans ses statistiques.</p>
    </div>
  );
}
