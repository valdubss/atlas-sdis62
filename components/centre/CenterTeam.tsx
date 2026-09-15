import { Phone } from "lucide-react";
import type { PersonCard } from "@/lib/centres/directory-types";
import { Avatar } from "@/components/ui/Avatar";
import { telHref } from "@/lib/geo/maps";

/** Agents du centre ou du service ayant coché « visible dans l'annuaire ». */
export function CenterTeam({ people, title = "Agents" }: { people: PersonCard[]; title?: string }) {
  if (people.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">
        {title} <span className="text-text-3">{people.length}</span>
      </h2>
      <ul className="hairline rounded-[16px] bg-bg-1">
        {people.map((p) => (
          <li key={p.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
            <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-text-1">
                {p.first_name} {p.last_name}
              </span>
              {p.job_title && <span className="block truncate text-[13px] text-text-3">{p.job_title}</span>}
            </span>
            {p.work_phone && (
              <a href={telHref(p.work_phone)} aria-label={`Appeler ${p.first_name} ${p.last_name}`} className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-bg-2 text-text-1">
                <Phone size={18} strokeWidth={1.75} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
