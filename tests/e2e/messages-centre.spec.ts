import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Messagerie de centre : un agent n'est proposé qu'aux agents de son centre, peut ouvrir une
 * conversation avec un collègue du même centre, et la base refuse un membre d'un autre centre.
 */
test("messagerie : conversations limitées aux membres du centre", async ({ browser }) => {
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const { data: c1 } = await admin.from("centers").insert({ name: `Centre A ${stamp}`, slug: `centre-a-${stamp}`, city: "Arras", type: "cis", is_active: false, sort_order: 998 }).select("id").single();
  const { data: c2 } = await admin.from("centers").insert({ name: `Centre B ${stamp}`, slug: `centre-b-${stamp}`, city: "Lens", type: "cis", is_active: false, sort_order: 998 }).select("id").single();
  const a1 = await createTestUser(admin, "a1");
  const a2 = await createTestUser(admin, "a2");
  const b1 = await createTestUser(admin, "b1");
  await admin.from("profiles").update({ center_id: c1!.id }).in("id", [a1.id, a2.id]);
  await admin.from("profiles").update({ center_id: c2!.id }).eq("id", b1.id);
  const page = await (await browser.newContext()).newPage();
  let channelId: string | null = null;
  try {
    await loginWithPassword(page, a1.email, a1.password);
    await page.goto("/messages/nouveau", { waitUntil: "networkidle" });
    await expect(page.getByText("Nouvelle conversation").first()).toBeVisible();
    // Le collègue du même centre est proposé, pas celui de l'autre centre
    await expect(page.getByRole("button", { name: /Test a2/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Test b1/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Test a2/ }).click();
    await page.getByRole("button", { name: /Suivant \(1\)/ }).click();
    await expect(page.getByLabel("Nom du groupe")).toHaveValue("Test");
    await page.getByRole("button", { name: /Créer/ }).click();
    await page.waitForURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 20_000 });
    channelId = page.url().match(/[0-9a-f-]{36}/)![0];
    const { count } = await admin.from("channel_members").select("profile_id", { count: "exact", head: true }).eq("channel_id", channelId);
    expect(count).toBe(2);

    // La base refuse un membre d'un autre centre, même par appel direct
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await anon.auth.signInWithPassword({ email: a1.email, password: a1.password });
    const { error } = await anon.from("channel_members").insert({ channel_id: channelId, profile_id: b1.id, added_by: a1.id, role: "member" });
    expect(error).not.toBeNull();
  } finally {
    if (channelId) await admin.from("channels").delete().eq("id", channelId);
    for (const u of [a1, a2, b1]) await admin.auth.admin.deleteUser(u.id);
    await admin.from("centers").delete().in("id", [c1!.id, c2!.id]);
  }
});
