import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchEventById } from "@/lib/agenda/queries";
import { EventEditor } from "@/components/studio/EventEditor";
import { loadPostRefs } from "../load";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Modifier l'événement" };
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [event, posts, { data: participants }] = await Promise.all([fetchEventById(id), loadPostRefs(), supabase.rpc("event_participants", { p_event: id })]);
  if (!event) notFound();
  const list = ((participants ?? []) as unknown as { id: string; name: string | null; center: string | null; at: string }[]) ?? [];
  return (
    <div className="space-y-8">
      <EventEditor event={event} posts={posts} />
      <section className="mx-auto max-w-[720px] space-y-2">
        <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          Participants <span className="text-text-3">{list.length}</span>
        </h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {list.length === 0 && <p className="px-5 py-4 text-[15px] text-text-2">Personne ne s&apos;est encore déclaré. Les agents disent « Je participe » depuis l&apos;agenda.</p>}
          {list.map((p) => (
            <div key={p.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-[15px]">
              <span className="truncate text-text-1">{p.name ?? "Agent"}</span>
              <span className="shrink-0 text-[13px] text-text-3">
                {p.center ?? ""}
                {p.center ? " · " : ""}
                {formatDateTime(p.at)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
