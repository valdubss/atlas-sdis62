import "../ws-shim";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Env = Record<string, string>;

export function loadEnv(): Env {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local introuvable");
  return Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

export function adminClient(env: Env): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Lien de connexion (magiclink) pour un compte existant, sans e-mail. */
export async function magicLink(env: Env, base: string, email: string) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const data = (await res.json()) as { hashed_token?: string };
  if (!data.hashed_token) throw new Error("Lien de connexion impossible : " + JSON.stringify(data));
  return `${base}/auth/callback?type=magiclink&token_hash=${data.hashed_token}`;
}

/** Compte de test @sdis62.fr, accueil déjà passé, mot de passe aléatoire. */
export async function createTestUser(admin: SupabaseClient, label: string) {
  const stamp = Date.now().toString(36);
  const email = `e2e-${label}-${stamp}@sdis62.fr`;
  const password = crypto.randomBytes(12).toString("base64url") + "Aa1";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: "Test", last_name: label } });
  if (error) throw error;
  await admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", data.user.id);
  return { id: data.user.id, email, password, stamp };
}

export async function loginWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").first().fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

/** Retire les push en file et les notifications liées à des posts de test. */
export async function scrubNotifications(admin: SupabaseClient, postIds: string[], needle: string) {
  const { data: queue } = await admin.from("notification_queue").select("id, payload").in("status", ["pending", "processing"]);
  const ids = (queue ?? []).filter((q) => postIds.includes((q.payload as { post_id?: string })?.post_id ?? "")).map((q) => q.id);
  if (ids.length) await admin.from("notification_queue").delete().in("id", ids);
  await admin.from("notifications").delete().ilike("body", `%${needle}%`);
  await admin.from("notifications").delete().ilike("title", `%${needle}%`);
}
