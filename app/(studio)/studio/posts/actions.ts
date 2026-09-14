"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { createClient } from "@/lib/supabase/server";
import { postSchema } from "@/lib/validation/post";
import { friendlyDbError } from "@/lib/validation/comment";

export type PostFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: Record<string, string> };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Crée ou met à jour une publication (brouillon, programmation ou publication). */
export async function savePost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const parsed = postSchema.safeParse({
    id: formData.get("id") ?? "",
    type: formData.get("type"),
    title: formData.get("title") ?? "",
    excerpt: formData.get("excerpt") ?? "",
    body: formData.get("body") ?? "",
    category_id: formData.get("category_id") ?? "",
    center_id: formData.get("center_id") ?? "",
    tags: formData.get("tags") ?? "",
    author_display: formData.get("author_display") ?? "service_com",
    comments_enabled: formData.get("comments_enabled") === "on",
    pinned: formData.get("pinned") === "on",
    action: formData.get("action") ?? "draft",
    scheduled_at: formData.get("scheduled_at") ?? "",
    media: formData.get("media") ?? "[]",
    poll_options: formData.get("poll_options") ?? "",
    poll_closes_at: formData.get("poll_closes_at") ?? "",
  });

  if (!parsed.success) {
    const fields = fieldErrors(parsed.error.issues);
    return { status: "error", message: fields.media ?? "Vérifiez les champs signalés.", fields };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Tous les médias doivent être prêts (variantes générées) avant publication.
  if (v.media.length > 0) {
    const { data: rows } = await supabase
      .from("media")
      .select("id, status")
      .in("id", v.media.map((m) => m.id));
    const ready = new Set((rows ?? []).filter((r) => r.status === "ready").map((r) => r.id));
    const notReady = v.media.filter((m) => !ready.has(m.id));
    if (notReady.length > 0 && v.action !== "draft") {
      return { status: "error", message: "Attendez la fin du traitement des médias avant de publier.", fields: { media: "Médias en cours de traitement." } };
    }
  }

  const status = v.action === "publish" ? "published" : v.action === "schedule" ? "scheduled" : "draft";

  // Épinglage : conservé si déjà épinglé, sinon horodaté maintenant.
  let pinned_at: string | null = null;
  if (v.pinned) {
    if (v.id) {
      const { data: existing } = await supabase.from("posts").select("pinned_at").eq("id", v.id).maybeSingle();
      pinned_at = existing?.pinned_at ?? new Date().toISOString();
    } else {
      pinned_at = new Date().toISOString();
    }
  }

  const row = {
    type: v.type,
    title: v.title,
    excerpt: v.type === "article" ? v.excerpt : null,
    body: v.body || null,
    category_id: v.category_id,
    center_id: v.center_id,
    tags: v.tags,
    author_display: v.author_display,
    comments_enabled: v.comments_enabled,
    pinned_at,
    status,
    scheduled_at: status === "scheduled" ? new Date(v.scheduled_at!).toISOString() : null,
    // Article : la première image sert de couverture ; photo/vidéo : médias du carrousel.
    cover_media_id: v.type === "article" ? (v.media[0]?.id ?? null) : null,
    ...(status === "draft" ? { published_at: null } : {}),
  } as const;

  let id = v.id;
  if (id) {
    const { error } = await supabase.from("posts").update(row).eq("id", id);
    if (error) return { status: "error", message: friendlyDbError(error.message) };
  } else {
    const { data, error } = await supabase
      .from("posts")
      .insert({ ...row, author_id: user.id })
      .select("id")
      .single();
    if (error || !data) return { status: "error", message: friendlyDbError(error?.message) };
    id = data.id;
  }

  // Sondage : question = titre ; options recréées tant qu'aucun vote n'existe
  if (v.type === "poll") {
    const { count: votes } = await supabase.from("poll_votes").select("poll_id", { count: "exact", head: true }).eq("poll_id", id);
    const closes = v.poll_closes_at ? new Date(v.poll_closes_at).toISOString() : null;
    const { error: pollError } = await supabase.from("polls").upsert({ post_id: id, question: v.title!, closes_at: closes });
    if (pollError) return { status: "error", message: friendlyDbError(pollError.message) };
    if ((votes ?? 0) === 0) {
      await supabase.from("poll_options").delete().eq("poll_id", id);
      const { error: optError } = await supabase.from("poll_options").insert(v.poll_options.map((label, i) => ({ poll_id: id!, label, position: i })));
      if (optError) return { status: "error", message: friendlyDbError(optError.message) };
    } else {
      // Des votes existent : seuls les libellés des options existantes sont mis à jour, dans l'ordre
      const { data: existing } = await supabase.from("poll_options").select("id, position").eq("poll_id", id).order("position");
      await Promise.all((existing ?? []).map((o, i) => (v.poll_options[i] ? supabase.from("poll_options").update({ label: v.poll_options[i] }).eq("id", o.id) : Promise.resolve())));
    }
  }

  // Synchronisation des médias rattachés (ordre + texte alternatif)
  const { error: delError } = await supabase.from("post_media").delete().eq("post_id", id);
  if (delError) return { status: "error", message: friendlyDbError(delError.message) };
  const attached = v.type === "article" ? v.media.slice(0, 1) : v.type === "text" || v.type === "poll" ? [] : v.media;
  if (attached.length > 0) {
    const { error: pmError } = await supabase.from("post_media").insert(
      attached.map((m, i) => ({ post_id: id!, media_id: m.id, position: i, alt: m.alt || null })),
    );
    if (pmError) return { status: "error", message: friendlyDbError(pmError.message) };
    // Texte alternatif : conservé aussi sur le média (galerie)
    await Promise.all(
      attached.filter((m) => m.alt).map((m) => supabase.from("media").update({ alt: m.alt }).eq("id", m.id)),
    );
  }

  revalidatePath("/");
  revalidatePath("/galerie");
  revalidatePath("/studio");
  revalidatePath("/studio/posts");
  if (status === "published") {
    // Les push partent après l'envoi de la réponse (le trigger SQL a rempli la file)
    after(async () => {
      try {
        await dispatchNotifications(50);
      } catch (e) {
        console.error("dispatch", e);
      }
    });
  }
  redirect(`/studio/posts/${id}?ok=${status}`);
}

export async function deletePost(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString(), status: "archived", pinned_at: null })
    .eq("id", id);
  if (error) return { ok: false as const, error: friendlyDbError(error.message) };
  revalidatePath("/");
  revalidatePath("/studio/posts");
  redirect("/studio/posts?ok=supprime");
}

export async function togglePin(id: string, pinned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath("/studio/posts");
  if (error) return { ok: false as const, error: friendlyDbError(error.message) };
  return { ok: true as const };
}
