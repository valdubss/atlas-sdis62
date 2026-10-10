import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Publications partagées" };
export const dynamic = "force-dynamic";

type Row = { post: { id: string; title: string | null; type: string; status: string; updated_at: string } | null };

const STATUS: Record<string, { label: string; tone: "neutral" | "navy" | "success" | "red" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  scheduled: { label: "Programmée", tone: "navy" },
  published: { label: "Publiée", tone: "success" },
  archived: { label: "Archivée", tone: "neutral" },
};
const TYPE_LABEL: Record<string, string> = { text: "Annonce", article: "Article", photo: "Photos", video: "Vidéo", poll: "Sondage" };

/** Publications sur lesquelles l'agent connecté est co-rédacteur. */
export default async function SharedPostsPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const supabase = await createClient();
  const { data } = await supabase.from("post_editors").select("post:posts!post_editors_post_id_fkey(id, title, type, status, updated_at)").eq("profile_id", current.user.id).order("created_at", { ascending: false });
  const rows = ((data ?? []) as unknown as Row[]).map((r) => r.post).filter((p): p is NonNullable<Row["post"]> => Boolean(p));

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Publications partagées</h1>
        <p className="text-[13px] text-text-3">Le service communication vous a ajouté comme co-rédacteur : vous modifiez le texte et les médias, la mise en ligne reste de son ressort.</p>
      </div>
      <div className="hairline rounded-[16px] bg-bg-1">
        {rows.length === 0 ? (
          <EmptyState title="Aucune publication partagée" description="Quand un éditeur vous ajoutera, elle apparaîtra ici." />
        ) : (
          rows.map((p) => {
            const st = STATUS[p.status] ?? STATUS.draft;
            return (
              <Link key={p.id} href={`/studio/posts/${p.id}`} className="flex items-center gap-4 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">{p.title?.trim() || "Sans titre"}</span>
                  <span className="block text-[13px] text-text-3">
                    {TYPE_LABEL[p.type] ?? p.type} · modifiée {formatDateTime(p.updated_at)}
                  </span>
                </span>
                <Badge tone={st.tone}>{st.label}</Badge>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
