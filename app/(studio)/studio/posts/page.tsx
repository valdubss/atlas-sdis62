import type { Metadata } from "next";
import Link from "next/link";
import { NewButton } from "@/components/studio/NewButton";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Publications" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  type: string;
  slug: string;
  title: string | null;
  body: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  published_at: string | null;
  scheduled_at: string | null;
  pinned_at: string | null;
  updated_at: string;
  reactions: { count: number }[];
  comments: { count: number }[];
};

const TABS = [
  { id: "", label: "Toutes" },
  { id: "draft", label: "Brouillons" },
  { id: "scheduled", label: "Programmées" },
  { id: "published", label: "Publiées" },
] as const;

const STATUS: Record<Row["status"], { label: string; tone: "neutral" | "navy" | "success" | "red" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  scheduled: { label: "Programmée", tone: "navy" },
  published: { label: "Publiée", tone: "success" },
  archived: { label: "Archivée", tone: "neutral" },
};

const TYPE_LABEL: Record<string, string> = { text: "Annonce", article: "Article", photo: "Photos", video: "Vidéo", poll: "Sondage" };

export default async function StudioPostsPage({ searchParams }: { searchParams: Promise<{ statut?: string; ok?: string }> }) {
  const { statut = "", ok } = await searchParams;
  const supabase = await createClient();
  await supabase.rpc("publish_scheduled");

  let query = supabase
    .from("posts")
    .select("id, type, slug, title, body, status, published_at, scheduled_at, pinned_at, updated_at, reactions(count), comments(count)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (statut) query = query.eq("status", statut as Row["status"]);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Publications</h1>
        <NewButton href="/studio/posts/new" label="Nouvelle publication" />
      </div>

      {ok === "supprime" && (
        <p role="status" className="text-[15px] text-text-2">
          Publication supprimée.
        </p>
      )}

      <nav className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="Filtrer par statut">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id ? `/studio/posts?statut=${t.id}` : "/studio/posts"}
            className={cn("h-9 shrink-0 rounded-full px-4 text-[13px] font-medium leading-9", statut === t.id ? "bg-bg-2 text-text-1" : "text-text-2 hover:text-text-1")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-[16px] bg-bg-1">
          <EmptyState title="Rien ici" description="Votre première publication apparaîtra dans le fil des agents." />
        </div>
      ) : (
        <div className="hairline rounded-[16px] bg-bg-1">
          {rows.map((r) => {
            const s = STATUS[r.status];
            const when = r.status === "scheduled" ? r.scheduled_at : r.published_at ?? r.updated_at;
            return (
              <Link key={r.id} href={`/studio/posts/${r.id}`} className="pressable flex min-h-[52px] items-center gap-4 px-5 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">{r.title ?? (r.body ?? "").slice(0, 80) ?? "Sans titre"}</span>
                  <span className="block text-[13px] text-text-3">
                    {TYPE_LABEL[r.type] ?? r.type}, {r.status === "scheduled" ? "prévue le " : ""}
                    {formatDateTime(when)}
                    {r.pinned_at && ", épinglée"}
                  </span>
                </span>
                <span className="hidden gap-4 text-[13px] tabular-nums text-text-2 sm:flex">
                  <span>{r.reactions?.[0]?.count ?? 0} réactions</span>
                  <span>{r.comments?.[0]?.count ?? 0} commentaires</span>
                </span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
