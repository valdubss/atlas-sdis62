"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { fromLocalInput } from "@/lib/time";

export type FlashFormState = { status: "idle" } | { status: "sent" } | { status: "error"; message: string; fields?: Record<string, string> };
type Result = { ok: true } | { ok: false; error: string };

const schema = z
  .object({
    title: z.string().trim().min(3, "Donnez un titre.").max(120, "120 caractères maximum."),
    body: z.string().trim().max(600, "600 caractères maximum."),
    level: z.enum(["info", "urgent"]),
    url: z
      .string()
      .trim()
      .max(300)
      .refine((u) => !u || u.startsWith("/") || /^https?:\/\//.test(u), "Lien invalide (adresse complète ou chemin /…)."),
    duration: z.enum(["2", "6", "12", "24", "48", "72", "custom"]),
    ends_at: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.duration === "custom") {
      const d = fromLocalInput(v.ends_at);
      if (!d) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Date de fin invalide." });
      else if (d.getTime() < Date.now() + 5 * 60_000) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "La fin doit être dans le futur." });
    }
  });

const revalidate = () => {
  revalidatePath("/");
  revalidatePath("/studio/flash");
};

/** Publie un flash : bandeau immédiat, push à tous les abonnés (préférences ignorées), notification dans l'app. */
export async function sendFlash(_prev: FlashFormState, formData: FormData): Promise<FlashFormState> {
  const parsed = schema.safeParse({
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    level: formData.get("level") === "info" ? "info" : "urgent",
    url: formData.get("url") ?? "",
    duration: formData.get("duration") ?? "6",
    ends_at: formData.get("ends_at") ?? "",
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
  if (!user) return { status: "error", message: "Session expirée." };

  const ends = v.duration === "custom" ? fromLocalInput(v.ends_at)! : new Date(Date.now() + Number(v.duration) * 3600_000);
  const { error } = await supabase.from("flashes").insert({
    title: v.title,
    body: v.body || null,
    level: v.level,
    url: v.url || null,
    ends_at: ends.toISOString(),
    created_by: user.id,
  });
  if (error) return { status: "error", message: friendlyDbError(error.message) };
  after(async () => {
    await dispatchNotifications(20).catch((e) => console.error("dispatch flash", e));
  });
  revalidate();
  return { status: "sent" };
}

/** Termine un flash avant son heure (retrait immédiat du bandeau). */
export async function endFlash(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("flashes").update({ ends_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}
