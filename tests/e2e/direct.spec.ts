import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Le Direct : le service com crée un direct, le lance (bandeau et carte épinglée en tête du
 * fil, notification), publie une entrée reçue en temps réel par un agent, puis le termine :
 * un récapitulatif est publié et le bandeau disparaît.
 */
test("direct : création, lancement, entrée en temps réel, clôture avec récapitulatif", async ({ browser }) => {
  test.setTimeout(180_000);
  const editor = await createTestUser(admin, "ed");
  await admin.from("profiles").update({ role: "editor" }).eq("id", editor.id);
  const agent = await createTestUser(admin, "agent");
  const stamp = editor.stamp;
  // Aucun autre direct actif ne doit traîner (un seul à la fois)
  await admin.from("lives").update({ status: "ended", ended_at: new Date().toISOString() }).eq("status", "live");
  const e = await (await browser.newContext()).newPage();
  const a = await (await browser.newContext()).newPage();
  let liveId: string | null = null;
  let recapId: string | null = null;
  try {
    await loginWithPassword(e, editor.email, editor.password);
    await e.goto("/studio/direct", { waitUntil: "networkidle" });
    await e.getByLabel("Titre").fill(`Direct test ${stamp}`);
    await e.getByLabel("Lieu (facultatif)").fill("Arras");
    await e.getByRole("button", { name: "Créer le direct" }).click();
    await e.waitForURL(/\/direct\/[0-9a-f-]{36}/, { timeout: 20_000 });
    liveId = e.url().match(/[0-9a-f-]{36}/)![0];
    await expect(e.getByText("Brouillon")).toBeVisible();

    // Lancement
    await e.getByRole("button", { name: "Lancer le direct" }).click();
    await e.getByRole("button", { name: "Lancer", exact: true }).click();
    await expect(e.getByText("Direct lancé")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await admin.from("lives").select("status").eq("id", liveId!).single()).data?.status, { timeout: 10_000 }).toBe("live");
    await expect.poll(async () => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", agent.id).eq("kind", "live")).count ?? 0, { timeout: 15_000 }).toBe(1);

    // Agent : bandeau et carte en tête du fil
    await loginWithPassword(a, agent.email, agent.password);
    await a.goto("/", { waitUntil: "networkidle" });
    await expect(a.getByRole("link", { name: /En direct.*Direct test/ })).toBeVisible();
    await expect(a.getByRole("article", { name: `En direct : Direct test ${stamp}` })).toBeVisible();
    await a.getByRole("link", { name: "Suivre le direct" }).click();
    await a.waitForURL(`/direct/${liveId}`);

    // Entrée publiée par l'éditeur, reçue par l'agent sans recharger
    await e.getByLabel("Texte de l'entrée").fill(`Point de situation ${stamp} : 3 engins engagés.`);
    await e.getByRole("button", { name: "Publier dans le direct" }).click();
    await expect(e.getByText("Entrée publiée")).toBeVisible({ timeout: 15_000 });
    await expect(a.getByText(`Point de situation ${stamp}`)).toBeVisible({ timeout: 20_000 });

    // Clôture : récapitulatif publié, bandeau disparu
    await e.getByRole("button", { name: "Terminer le direct" }).click();
    await e.getByRole("button", { name: "Terminer", exact: true }).click();
    await expect(e.getByText("Direct terminé, récapitulatif publié")).toBeVisible({ timeout: 20_000 });
    const { data: live } = await admin.from("lives").select("status, recap_post_id").eq("id", liveId).single();
    expect(live?.status).toBe("ended");
    recapId = live?.recap_post_id ?? null;
    expect(recapId).toBeTruthy();
    const { data: recap } = await admin.from("posts").select("title, body, status").eq("id", recapId!).single();
    expect(recap?.status).toBe("published");
    expect(recap?.body).toContain(`Point de situation ${stamp}`);
    await a.goto("/", { waitUntil: "networkidle" });
    await expect(a.getByRole("link", { name: /En direct.*Direct test/ })).toHaveCount(0);
  } finally {
    if (recapId) await admin.from("posts").delete().eq("id", recapId);
    if (liveId) await admin.from("lives").delete().eq("id", liveId);
    await admin.from("notifications").delete().in("user_id", [agent.id, editor.id]);
    for (const u of [editor, agent]) await admin.auth.admin.deleteUser(u.id);
  }
});
