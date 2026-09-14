"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { eventSchema, parseInput } from "@/lib/validation/event";
import { friendlyDbError } from "@/lib/validation/comment";

export type EventFormState = { status: "idle" } | { status: "error"; message: string; fields?: Record<string, string> };
type Result = { ok: true } | { ok: false; error: string };

const revalidate = () => {
  revalidatePath("/agenda");
  revalidatePath("/studio/agenda");
};

/** Crée ou met à jour un événement (brouillon ou publié). */
export async function saveEvent(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const parsed = eventSchema.safeParse({
    id: formData.get("id") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    location: formData.get("location") ?? "",
    all_day: formData.get("all_day") === "on" || formData.get("all_day") === "true",
    starts_at: formData.get("starts_at") ?? "",
    ends_at: formData.get("ends_at") ?? "",
    post_id: formData.get("post_id") ?? "",
    status: formData.get("status") === "draft" ? "draft" : "published",
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: "error", message: "Vérifiez les champs signalés.", fields };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const row = {
    title: v.title,
    description: v.description,
    location: v.location,
    all_day: v.all_day,
    starts_at: parseInput(v.starts_at, v.all_day, false)!.toISOString(),
    ends_at: v.ends_at ? parseInput(v.ends_at, v.all_day, true)!.toISOString() : null,
    post_id: v.post_id,
    status: v.status,
  };

  if (v.id) {
    const { error } = await supabase.from("events").update(row).eq("id", v.id);
    if (error) return { status: "error", message: friendlyDbError(error.message) };
  } else {
    const { error } = await supabase.from("events").insert({ ...row, author_id: user.id });
    if (error) return { status: "error", message: friendlyDbError(error.message) };
  }
  revalidate();
  redirect(`/studio/agenda?ok=${v.status}`);
}

/** Supprime un événement (corbeille : deleted_at). */
export async function deleteEvent(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}
