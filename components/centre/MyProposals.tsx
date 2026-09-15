"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withdrawProposal } from "@/app/(app)/centre/actions";
import type { MyProposal } from "@/lib/centres/public";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

const STATUS: Record<string, { label: string; tone: "neutral" | "red" | "success" | "navy" }> = {
  pending: { label: "En attente", tone: "navy" },
  published: { label: "Publiée", tone: "success" },
  declined: { label: "Refusée", tone: "red" },
  draft: { label: "En retouche", tone: "neutral" },
  archived: { label: "Archivée", tone: "neutral" },
};

/** Historique des propositions du référent, avec le message du service communication. */
export function MyProposals({ items }: { items: MyProposal[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  if (items.length === 0) return <EmptyState title="Aucune proposition" description="Vos actus, photos et événements proposés pour votre centre apparaîtront ici." />;
  return (
    <ul className="hairline rounded-[16px] bg-bg-1">
      {items.map((p) => {
        const st = STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
        const text = p.title ?? p.body?.slice(0, 80) ?? (p.kind === "event" ? "Événement" : "Actu");
        return (
          <li key={`${p.kind}-${p.id}`} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-text-1">{text}</span>
                <span className="block text-[13px] text-text-3">
                  {p.kind === "event" ? `Événement${p.starts_at ? ` · ${formatDateTime(p.starts_at)}` : ""}` : "Actu"}
                  {p.center && ` · ${p.center.name}`} · {formatRelative(p.created_at)}
                </span>
              </span>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            {p.moderation_message && p.status === "declined" && <p className="rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] text-text-2">« {p.moderation_message} »</p>}
            <div className="flex gap-3">
              {p.kind === "post" && p.status === "published" && p.center && (
                <Link href={`/centre/${p.center.slug}`} className="text-[13px] font-medium text-navy-link">
                  Voir sur la page du centre
                </Link>
              )}
              {p.status === "pending" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("Retirer cette proposition ?")) return;
                    start(async () => {
                      const r = await withdrawProposal(p.kind, p.id);
                      toast(r.ok ? "Proposition retirée" : r.error);
                      if (r.ok) router.refresh();
                    });
                  }}
                  className="text-[13px] font-medium text-text-3 hover:text-red-text"
                >
                  Retirer
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
