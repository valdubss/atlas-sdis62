import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Plage de silence : une publication mise en ligne pendant la plage d'un agent
 * n'est pas poussée tout de suite (mise en attente), puis regroupée à la fin
 * de la plage par le cron. Une seule push par contenu (clé de dédoublonnage).
 */
test("notifications : plage de silence, regroupement, une push par contenu", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const agent = await createTestUser(admin, "nuit");
  const { stamp } = agent;
  // Plage de silence couvrant l'instant présent (heure de Paris) : de maintenant - 1 h à maintenant + 2 h
  const paris = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
  await admin.from("user_settings").upsert({ user_id: agent.id, quiet_start: hh(paris.getHours() - 1), quiet_end: hh(paris.getHours() + 2), push_new_posts: true }, { onConflict: "user_id" });
  // Abonnement push factice (jamais joignable) pour que l'agent soit un destinataire
  await admin.from("push_subscriptions").insert({ user_id: agent.id, endpoint: `https://push.example.invalid/${stamp}`, p256dh: "BPl1Xn6q7Z7Vw3Kk7c8w6Gx4oQ0y9Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx7Kq6Zx", auth: "AAAAAAAAAAAAAAAAAAAAAA", user_agent: "e2e" });
  const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim() ?? "").maybeSingle();
  let postId: string | null = null;

  try {
    // Publication → une seule entrée en file pour ce contenu
    const { data: post } = await admin.from("posts").insert({ type: "text", title: `Nuit test ${stamp}`, body: "Bonne nuit", status: "published", published_at: new Date().toISOString(), author_id: adminProfile?.id ?? agent.id }).select("id").single();
    postId = post!.id;
    const { data: queued } = await admin.from("notification_queue").select("id, dedupe_key, status").eq("dedupe_key", `push_category:${postId}`);
    expect(queued).toHaveLength(1);
    // Une seconde insertion identique est ignorée (jamais de rappel)
    await admin.from("notification_queue").insert({ kind: "push_category", payload: { post_id: postId, title: "x", body: "x", url: "/" } });
    const { data: again } = await admin.from("notification_queue").select("id").eq("dedupe_key", `push_category:${postId}`);
    expect(again).toHaveLength(1);

    // Distribution (cron) : l'agent est en plage de silence → push différée, pas envoyée
    const res = await request.get("/api/cron/dispatch", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
    expect(res.ok()).toBe(true);
    const { data: deferred } = await admin.from("notification_deferred").select("id, payload, deliver_after").eq("user_id", agent.id);
    expect(deferred).toHaveLength(1);
    expect((deferred![0].payload as { title: string }).title).toBe("Nouvelle publication");
    expect(new Date(deferred![0].deliver_after).getTime()).toBeGreaterThan(Date.now());

    // Fin de plage simulée : le cron regroupe et vide la file différée
    await admin.from("notification_deferred").update({ deliver_after: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", agent.id);
    const res2 = await request.get("/api/cron/dispatch", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
    expect(res2.ok()).toBe(true);
    const { data: after } = await admin.from("notification_deferred").select("id").eq("user_id", agent.id);
    expect(after).toHaveLength(0);

    // Boîte de réception : la notification dans l'app existe et se filtre
    const page = await (await browser.newContext()).newPage();
    await loginWithPassword(page, agent.email, agent.password);
    await page.goto("/notifications", { waitUntil: "networkidle" });
    await expect(page.getByText(`Nuit test ${stamp}`)).toBeVisible();
    await page.getByRole("tab", { name: /Non lues/ }).click();
    await expect.poll(async () => (await admin.from("notifications").select("read_at").eq("user_id", agent.id).ilike("body", `%${stamp}%`).maybeSingle()).data?.read_at, { timeout: 15_000 }).not.toBeNull();

    // Préférences : plage de silence enregistrée depuis le profil
    await page.goto("/profil", { waitUntil: "networkidle" });
    await page.getByLabel("Début de la plage de silence").fill("22:00");
    await expect.poll(async () => (await admin.from("user_settings").select("quiet_start").eq("user_id", agent.id).single()).data?.quiet_start, { timeout: 15_000 }).toMatch(/^22:00/);
  } finally {
    await admin.from("notification_deferred").delete().eq("user_id", agent.id);
    await admin.from("notifications").delete().ilike("body", `%${stamp}%`);
    if (postId) {
      await admin.from("notification_queue").delete().ilike("dedupe_key", `%${postId}%`);
      await admin.from("posts").delete().eq("id", postId);
    }
    await admin.auth.admin.deleteUser(agent.id);
  }
});
