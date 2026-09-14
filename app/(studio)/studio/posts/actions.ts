"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  });

  if (!parsed.success) {
    return { status: "error", message: "Vérifiez les champs signalés.", fields: fieldErrors(parsed.error.issues) };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
    body: v.body,
    category_id: v.category_id,
    center_id: v.center_id,
    tags: v.tags,
    author_display: v.author_display,
    comments_enabled: v.comments_enabled,
    pinned_at,
    status,
    scheduled_at: status === "scheduled" ? new Date(v.scheduled_at!).toISOString() : null,
    // published_at : posé par le trigger à la publication ; remis à null si on repasse en brouillon
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

  revalidatePath("/");
  revalidatePath("/studio");
  revalidatePath("/studio/posts");
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
