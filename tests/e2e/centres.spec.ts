import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword, magicLink, scrubNotifications } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);
const ADMIN_EMAIL = env.E2E_ADMIN_EMAIL ?? (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();

/**
 * Un référent propose une actu → un éditeur la valide → l'agent du centre voit
 * le post sur la page du centre, la push « Nouveautés de mon centre » est en
 * file, et le fil départemental n'en contient rien.
 */
test("référent → validation → page du centre, push en file, fil intact", async ({ browser, baseURL }) => {
  test.skip(!ADMIN_EMAIL, "E2E_ADMIN_EMAIL ou ALLOWED_EMAILS requis");
  const referent = await createTestUser(admin, "referent");
  const agent = await createTestUser(admin, "agent");
  const { stamp } = referent;
  const { data: center } = await admin.from("centers").insert({ slug: `e2e-centre-${stamp}`, name: `CIS Test ${stamp}`, type: "cis", city: "Arras", phone: "03 21 00 00 00" }).select("id, slug").single();
  await admin.from("center_referents").insert({ center_id: center!.id, profile_id: referent.id });
  await admin.from("profiles").update({ center_id: center!.id }).eq("id", agent.id);
  const posts: string[] = [];

  try {
    // Référent : rattachement puis proposition
    const rctx = await browser.newContext();
    const r = await rctx.newPage();
    await loginWithPassword(r, referent.email, referent.password);
    await r.goto("/centre");
    await r.getByLabel("Rechercher un centre").fill(stamp);
    await r.getByRole("button", { name: new RegExp(`CIS Test ${stamp}`) }).click();
    await r.waitForURL(`**/centre/${center!.slug}`);
    await r.getByRole("button", { name: /Proposer/ }).click();
    await r.getByLabel("Titre (facultatif)").fill(`Actu test ${stamp}`);
    await r.getByLabel("Votre actu").fill("Manœuvre du samedi matin.");
    await r.getByRole("button", { name: "Envoyer la proposition" }).click();
    await expect.poll(async () => (await admin.from("posts").select("id, status").eq("title", `Actu test ${stamp}`).maybeSingle()).data?.status).toBe("pending");
    const { data: pending } = await admin.from("posts").select("id").eq("title", `Actu test ${stamp}`).single();
    posts.push(pending!.id);

    // Éditeur : validation dans le Studio
    const actx = await browser.newContext();
    const a = await actx.newPage();
    await a.goto(await magicLink(env, baseURL!, ADMIN_EMAIL!), { waitUntil: "networkidle" });
    await a.goto("/studio/centres", { waitUntil: "networkidle" });
    await a.locator("article", { hasText: `Actu test ${stamp}` }).getByRole("button", { name: "Valider" }).click();
    await expect.poll(async () => (await admin.from("posts").select("status").eq("id", pending!.id).single()).data?.status).toBe("published");

    // Push « Nouveautés de mon centre » en file (vérifiée, puis retirée)
    const { data: queue } = await admin.from("notification_queue").select("kind, payload").eq("kind", "push_center");
    expect((queue ?? []).some((q) => (q.payload as { post_id?: string }).post_id === pending!.id)).toBe(true);

    // Agent du centre : voit le post sur la page du centre, pas dans le fil
    const gctx = await browser.newContext();
    const g = await gctx.newPage();
    await loginWithPassword(g, agent.email, agent.password);
    await g.goto("/centre", { waitUntil: "networkidle" });
    await expect(g).toHaveURL(new RegExp(`/centre/${center!.slug}$`));
    await expect(g.getByText(`Actu test ${stamp}`)).toBeVisible();
    await g.goto("/", { waitUntil: "networkidle" });
    await expect(g.getByText(`Actu test ${stamp}`)).toHaveCount(0);

    // Auteur prévenu (cloche)
    await r.goto("/notifications", { waitUntil: "networkidle" });
    await expect(r.locator("main")).toContainText(`Actu test ${stamp}`);
  } finally {
    await scrubNotifications(admin, posts, stamp);
    if (posts.length) await admin.from("posts").delete().in("id", posts);
    await admin.from("center_referents").delete().eq("center_id", center!.id);
    await admin.from("centers").delete().eq("id", center!.id);
    await admin.auth.admin.deleteUser(referent.id);
    await admin.auth.admin.deleteUser(agent.id);
  }
});
