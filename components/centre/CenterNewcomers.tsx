import type { Newcomer } from "@/lib/centres/public";
import { Avatar } from "@/components/ui/Avatar";
import { formatDateLong } from "@/lib/format";

/** Nouveaux arrivants (moins de 60 jours) ayant accepté d'être présentés. */
export function CenterNewcomers({ people }: { people: Newcomer[] }) {
  if (people.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Bienvenue à</h2>
      <ul className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:-mx-0 sm:px-0">
        {people.map((p) => (
          <li key={p.id} className="flex w-[132px] shrink-0 flex-col items-center gap-2 rounded-[16px] bg-bg-1 px-3 py-4 text-center">
            <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="lg" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-text-1">{p.first_name}</span>
              <span className="block truncate text-[13px] text-text-3">{p.job_title ?? (p.center_joined_at ? `depuis le ${formatDateLong(p.center_joined_at)}` : "Nouvel arrivant")}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
