import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Fil : position restaurée au retour d'une publication ; recherche globale
 * tolérante aux fautes ; lecture qualifiée d'un article (80 % de défilement).
 */
test("fil : position restaurée, recherche globale, lecture qualifiée", async ({ browser }) => {
  test.setTimeout(180_000);
  const agent = await createTestUser(admin, "fil");
  const { stamp } = agent;
  const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim() ?? "").maybeSingle();
  const body = Array.from({ length: 12 }, (_, i) => `## Partie ${i + 1}\n\n${"Texte de l'article, ligne après ligne. ".repeat(40)}`).join("\n\n");
  const { data: post } = await admin
    .from("posts")
    .insert({ type: "article", title: `Article Wimereux ${stamp}`, excerpt: "Un article de test", body, status: "published", published_at: new Date().toISOString(), author_id: adminProfile?.id ?? agent.id })
    .select("id, slug")
    .single();
  const postId = post!.id;
  // Quelques publications de plus pour que le fil soit assez haut à défiler
  const { data: fillers } = await admin
    .from("posts")
    .insert(Array.from({ length: 6 }, (_, i) => ({ type: "article", title: `Remplissage ${i + 1} ${stamp}`, excerpt: "Texte de remplissage pour donner de la hauteur au fil.", body: "Contenu.", status: "published", published_at: new Date(Date.now() - (i + 1) * 60_000).toISOString(), author_id: adminProfile?.id ?? agent.id })))
    .select("id");
  const fillerIds = (fillers ?? []).map((f) => f.id);

  try {
    const page = await (await browser.newContext()).newPage();
    await loginWithPassword(page, agent.email, agent.password);
    await page.goto("/", { waitUntil: "networkidle" });

    // Défilement, ouverture de l'article, retour → même position (± 40 px)
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(600);
    const y0 = await page.evaluate(() => window.scrollY);
    expect(y0).toBeGreaterThan(300);
    await page.goto(`/post/${post!.slug}`, { waitUntil: "networkidle" });
    await expect(page.getByText(/min de lecture/)).toBeVisible();
    // Article lu à 80 % → lecture qualifiée
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(async () => (await admin.from("post_views").select("read").eq("post_id", postId).eq("user_id", agent.id).maybeSingle()).data?.read ?? false, { timeout: 15_000 }).toBe(true);
    await page.goBack({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const y = await page.evaluate(() => window.scrollY);
    expect(Math.abs(y - y0)).toBeLessThan(40);

    // Recherche globale avec une faute de frappe
    await page.getByRole("button", { name: "Rechercher" }).click();
    await page.getByLabel("Rechercher dans ATLAS").fill("wimereu");
    const hit = page.getByRole("link", { name: new RegExp(`Article Wimereux ${stamp}`) });
    await expect(hit).toBeVisible({ timeout: 15_000 });
    await hit.click();
    await expect(page).toHaveURL(new RegExp(`/post/${post!.slug}$`), { timeout: 15_000 });
    // Historique local des recherches
    await page.goto("/");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByRole("button", { name: "wimereu" })).toBeVisible({ timeout: 15_000 });
  } finally {
    await admin.from("posts").delete().in("id", [postId, ...fillerIds]);
    await admin.from("notifications").delete().ilike("body", `%${stamp}%`);
    const { data: queue } = await admin.from("notification_queue").select("id, dedupe_key").ilike("dedupe_key", `%${postId}%`);
    if (queue?.length) await admin.from("notification_queue").delete().in("id", queue.map((q) => q.id));
    await admin.auth.admin.deleteUser(agent.id);
  }
});
