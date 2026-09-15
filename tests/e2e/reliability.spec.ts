import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/** Lot 8 : état des services, journal d'audit et export CSV, réaction hors ligne rejouée. */
test("fiabilité : /api/health, /etat, journal, file hors ligne", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const editor = await createTestUser(admin, "fiab-ed");
  await admin.from("profiles").update({ role: "admin" }).eq("id", editor.id);
  const agent = await createTestUser(admin, "fiab-agent");
  const { stamp } = agent;
  const { data: post } = await admin.from("posts").select("id, slug").eq("status", "published").is("deleted_at", null).order("published_at", { ascending: false }).limit(1).maybeSingle();

  try {
    // /api/health répond avec la liste des services
    const health = await request.get("/api/health");
    expect([200, 503]).toContain(health.status());
    const body = (await health.json()) as { services: { key: string; status: string }[] };
    expect(body.services.map((s) => s.key)).toEqual(["db", "storage", "video", "notifications", "messaging"]);
    expect(body.services.find((s) => s.key === "db")?.status).toBe("ok");

    // Admin : déclare un incident, le journal le trace, l'export CSV le contient
    const e = await (await browser.newContext()).newPage();
    await loginWithPassword(e, editor.email, editor.password);
    await e.goto("/studio/journal", { waitUntil: "networkidle" });
    await e.getByLabel("Titre").fill(`Incident test ${stamp}`);
    await e.getByRole("button", { name: "Déclarer" }).click();
    await expect(e.getByText(`Incident test ${stamp}`)).toBeVisible({ timeout: 15_000 });
    await e.goto("/etat", { waitUntil: "networkidle" });
    await expect(e.getByText(`Incident test ${stamp}`)).toBeVisible();
    await expect(e.getByText("Base de données")).toBeVisible();
    const csv = await e.request.get("/studio/journal/export?type=incidents");
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain(`Incident test ${stamp}`);

    // Agent hors ligne : réaction mise en file puis rejouée au retour du réseau
    if (post) {
      const ctx = await browser.newContext();
      const a = await ctx.newPage();
      await loginWithPassword(a, agent.email, agent.password);
      await a.goto(`/post/${post.slug}`, { waitUntil: "networkidle" });
      await ctx.setOffline(true);
      await a.evaluate(() => window.dispatchEvent(new Event("offline")));
      await a.getByRole("button", { name: /Au top/ }).first().click();
      await expect(a.getByText(/Hors ligne/).first()).toBeVisible({ timeout: 10_000 });
      await ctx.setOffline(false);
      await a.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(async () => (await admin.from("reactions").select("kind").eq("post_id", post.id).eq("user_id", agent.id).maybeSingle()).data?.kind ?? null, { timeout: 20_000 }).toBe("fire");
    }
  } finally {
    await admin.from("incidents").delete().ilike("title", `%${stamp}%`);
    if (post) await admin.from("reactions").delete().eq("post_id", post.id).eq("user_id", agent.id);
    for (const u of [editor, agent]) await admin.auth.admin.deleteUser(u.id);
  }
});
