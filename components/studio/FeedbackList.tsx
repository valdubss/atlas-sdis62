"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setFeedbackStatus } from "@/app/(app)/profil/signaler/actions";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS } from "@/lib/validation/feedback";
import { mediaUrl } from "@/lib/media/url";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { Lightbox } from "@/components/feed/Lightbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

export type FeedbackRow = {
  id: string;
  category: "bug" | "content" | "suggestion";
  description: string;
  screenshot_key: string | null;
  context: { path?: string; user_agent?: string; viewport?: string; app_version?: string };
  status: "new" | "seen" | "done";
  created_at: string;
  handled_at: string | null;
  author: { first_name: string; last_name: string; email: string; center: { name: string } | null } | null;
};

const TABS = [
  { id: "", label: "Tous" },
  { id: "new", label: "Nouveaux" },
  { id: "seen", label: "Vus" },
  { id: "done", label: "Traités" },
] as const;

function shortUa(ua = "") {
  const m = ua.match(/(iPhone|iPad|Android|Windows|Macintosh|Linux)[^;)]*/);
  const b = ua.match(/(Edg|Chrome|Firefox|Safari)\/([\d.]+)/);
  return [m?.[0], b ? `${b[1] === "Edg" ? "Edge" : b[1]} ${b[2].split(".")[0]}` : null].filter(Boolean).join(", ");
}

export function FeedbackList({ rows, statut }: { rows: FeedbackRow[]; statut: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<FeedbackRow | null>(null);
  const toast = useToast();

  function setStatus(row: FeedbackRow, status: FeedbackRow["status"]) {
    start(async () => {
      const r = await setFeedbackStatus(row.id, status);
      toast(r.ok ? `Marqué « ${FEEDBACK_STATUS[status]} »` : r.error);
      if (r.ok) window.location.reload();
    });
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Retours des agents</h1>
      <nav className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="Filtrer par statut">
        {TABS.map((t) => (
          <Link key={t.id} href={t.id ? `/studio/retours?statut=${t.id}` : "/studio/retours"} className={cn("h-9 shrink-0 rounded-full px-4 text-[13px] font-medium leading-9", statut === t.id ? "bg-bg-2 text-text-1" : "text-text-2 hover:text-text-1")}>
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="hairline rounded-[16px] bg-bg-1">
        {rows.length === 0 ? (
          <EmptyState title="Aucun retour" description="Les signalements envoyés depuis le profil des agents apparaîtront ici." />
        ) : (
          rows.map((r) => {
            const cat = FEEDBACK_CATEGORIES.find((c) => c.id === r.category);
            const name = r.author ? `${r.author.first_name} ${r.author.last_name}`.trim() || r.author.email : "Agent supprimé";
            return (
              <div key={r.id} className="flex gap-4 px-5 py-4">
                {r.screenshot_key && (
                  <button type="button" onClick={() => setOpen(r)} className="h-20 w-14 shrink-0 overflow-hidden rounded-[8px] bg-bg-2" aria-label="Voir la capture">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vignette */}
                    <img src={mediaUrl(r.screenshot_key)} alt="" className="h-full w-full object-cover" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.status === "new" ? "red" : r.status === "done" ? "success" : "neutral"}>{FEEDBACK_STATUS[r.status]}</Badge>
                    <span className="text-[13px] text-text-2">{cat?.label}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line break-words text-[15px] text-text-1">{r.description}</p>
                  <p className="mt-1 text-[13px] text-text-3">
                    {name}
                    {r.author?.center && `, ${r.author.center.name}`}, {formatDateTime(r.created_at)}
                    {r.context.path && `, page ${r.context.path}`}
                    {r.context.user_agent && `, ${shortUa(r.context.user_agent)}`}
                    {r.context.viewport && ` ${r.context.viewport}`}
                    {r.context.app_version && `, v${r.context.app_version}`}
                  </p>
                  <div className="mt-2 flex gap-4 text-[13px] font-medium text-text-2">
                    {r.status !== "seen" && r.status !== "done" && (
                      <button type="button" disabled={pending} onClick={() => setStatus(r, "seen")} className="hover:text-text-1">
                        Marquer vu
                      </button>
                    )}
                    {r.status !== "done" && (
                      <button type="button" disabled={pending} onClick={() => setStatus(r, "done")} className="hover:text-text-1">
                        Marquer traité
                      </button>
                    )}
                    {r.status === "done" && (
                      <button type="button" disabled={pending} onClick={() => setStatus(r, "new")} className="hover:text-text-1">
                        Rouvrir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {open?.screenshot_key && <Lightbox open src={mediaUrl(open.screenshot_key)} alt="Capture d'écran" layoutId={`fb-${open.id}`} onClose={() => setOpen(null)} />}
    </div>
  );
}
