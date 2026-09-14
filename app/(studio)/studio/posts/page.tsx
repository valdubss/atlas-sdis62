import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Card, SectionTitle } from "@/components/ui/Card";
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

const STATUS: Record<Row["status"], { label: string; tone: "muted" | "navy" | "success" | "red" }> = {
  draft: { label: "Brouillon", tone: "muted" },
  scheduled: { label: "Programmé", tone: "navy" },
  published: { label: "Publié", tone: "success" },
  archived: { label: "Archivé", tone: "muted" },
};

const TYPE_LABEL: Record<string, string> = { text: "Annonce", article: "Article", photo: "Photos", video: "Vidéo", poll: "Sondage" };

export default async function StudioPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; ok?: string }>;
}) {
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
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Publications</SectionTitle>
        <Link href="/studio/posts/new" className="rounded-xl bg-red px-4 py-2.5 text-sm font-bold text-white hover:bg-red-hover">
          + Nouvelle publication
        </Link>
      </div>

      {ok === "supprime" && (
        <p role="status" className="rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold text-body">
          Publication supprimée.
        </p>
      )}

      <nav className="flex gap-2 overflow-x-auto" aria-label="Filtrer par statut">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id ? `/studio/posts?statut=${t.id}` : "/studio/posts"}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold",
              statut === t.id ? "bg-white text-bg" : "glass text-body hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Rien ici"
            description="Créez votre première publication : elle apparaîtra dans le fil des agents."
            action={
              <Link href="/studio/posts/new" className="rounded-xl bg-red px-4 py-2 text-sm font-bold text-white">
                Nouvelle publication
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((r) => {
            const s = STATUS[r.status];
            const when = r.status === "scheduled" ? r.scheduled_at : r.published_at ?? r.updated_at;
            return (
              <Link
                key={r.id}
                href={`/studio/posts/${r.id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">
                    {r.title ?? (r.body ?? "").slice(0, 80) ?? "Sans titre"}
                  </p>
                  <p className="text-xs text-muted">
                    {TYPE_LABEL[r.type] ?? r.type} · {r.status === "scheduled" ? "prévu le " : ""}
                    {formatDateTime(when)}
                    {r.pinned_at && <span className="ml-2 font-semibold text-red-text">Épinglé</span>}
                  </p>
                </div>
                <div className="hidden items-center gap-4 text-xs text-muted sm:flex">
                  <span title="Réactions">👏 {r.reactions?.[0]?.count ?? 0}</span>
                  <span title="Commentaires">💬 {r.comments?.[0]?.count ?? 0}</span>
                </div>
                <Badge tone={s.tone}>{s.label}</Badge>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
