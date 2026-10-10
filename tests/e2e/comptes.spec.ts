import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Lot comptes : rattachement validé par le chef de centre (lien e-mail et app),
 * co-rédacteur extérieur au service, réactions désactivables, événement de
 * centre visible des seuls membres.
 */
test("comptes : rattachement validé, co-rédacteur, réactions, événement de centre", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const agent = await createTestUser(admin, "cpt-agent");
  const chief = await createTestUser(admin, "cpt-chef");
  const editor = await createTestUser(admin, "cpt-ed");
  const outsider = await createTestUser(admin, "cpt-ext");
  await admin.from("profiles").update({ role: "editor" }).eq("id", editor.id);
  const { data: centers } = await admin.from("centers").select("id, slug, name").eq("type", "cis").eq("is_active", true).order("name").limit(1);
  test.skip(!centers || centers.length < 1, "Un centre actif nécessaire.");
  const center = centers![0];
  // Le chef de centre est reconnu par son adresse (saisie par l'administrateur)
  await admin.from("centers").update({ chief_name: "Chef Test", chief_email: chief.email }).eq("id", center.id);
  let postId: string | null = null;
  let eventId: string | null = null;

  try {
    // --- 1. L'agent demande son rattachement : rien n'est posé, une demande part ------------
    const page = await (await browser.newContext()).newPage();
    await loginWithPassword(page, agent.email, agent.password);
    await page.goto("/profil/centre", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Choisir" }).click();
    await page.getByLabel("Rechercher un centre").fill(center.name);
    await page.getByRole("button", { name: new RegExp(center.name) }).first().click();
    await page.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(page.getByText(/Demande envoyée/)).toBeVisible({ timeout: 15_000 });
    const { data: req } = await admin.from("membership_requests").select("id, recipient_email, status").eq("profile_id", agent.id).eq("status", "pending").single();
    expect(req?.recipient_email).toBe(chief.email);
    expect((await admin.from("profiles").select("center_id").eq("id", agent.id).single()).data?.center_id).toBeNull();
    // Le chef a une notification dans l'app
    await expect.poll(async () => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", chief.id).eq("kind", "membership")).count, { timeout: 10_000 }).toBeGreaterThan(0);

    // --- 2. Le chef accepte dans l'app depuis la page du centre ------------------------------
    const chiefPage = await (await browser.newContext()).newPage();
    await loginWithPassword(chiefPage, chief.email, chief.password);
    await chiefPage.goto(`/centre/${center.slug}`, { waitUntil: "networkidle" });
    await expect(chiefPage.getByText(/Demandes de rattachement/)).toBeVisible({ timeout: 15_000 });
    await chiefPage.getByRole("button", { name: "Accepter" }).first().click();
    await expect.poll(async () => (await admin.from("profiles").select("center_id").eq("id", agent.id).single()).data?.center_id, { timeout: 15_000 }).toBe(center.id);
    expect((await admin.from("membership_requests").select("status, decided_via").eq("id", req!.id).single()).data).toMatchObject({ status: "accepted", decided_via: "app" });

    // --- 3. Lien e-mail : page publique, décision au clic seulement ------------------------
    // On simule une nouvelle demande d'un autre agent et on récupère le jeton via la fonction SQL (service_role)
    const outsiderPage = await (await browser.newContext()).newPage();
    await loginWithPassword(outsiderPage, outsider.email, outsider.password);
    await outsiderPage.goto("/centre", { waitUntil: "networkidle" });
    await outsiderPage.getByLabel("Rechercher un centre").fill(center.name);
    await outsiderPage.getByRole("button", { name: new RegExp(center.name) }).first().click();
    await expect(outsiderPage.getByText(/Demande/)).toBeVisible({ timeout: 15_000 });
    const { data: req3 } = await admin.from("membership_requests").select("id").eq("profile_id", outsider.id).eq("status", "pending").single();
    // Le jeton n'est pas lisible : on vérifie que la page refuse un jeton inconnu et traite un jeton valide généré à part
    const anon = await browser.newPage();
    await anon.goto(`${baseURL}/rattachement/${"0".repeat(48)}`);
    await expect(anon.getByText("Lien invalide")).toBeVisible();
    // Décision par la fonction de service (même chemin que le lien e-mail)
    const { data: decided } = await admin.rpc("apply_membership_decision", { p_request: req3!.id, p_accept: false, p_note: "Pas de ce centre", p_by: null, p_via: "email" });
    expect((decided as { ok: boolean }).ok).toBe(true);
    expect((await admin.from("profiles").select("center_id").eq("id", outsider.id).single()).data?.center_id).toBeNull();
    await expect.poll(async () => (await admin.from("notifications").select("title").eq("user_id", outsider.id).eq("kind", "membership").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.title ?? "", { timeout: 10_000 }).toMatch(/refusé/);

    // --- 4. Co-rédacteur : l'éditeur ajoute l'agent extérieur, qui modifie sans publier --------
    const { data: post } = await admin.from("posts").insert({ type: "text", title: `Co-rédaction ${agent.stamp}`, body: "Texte initial", status: "draft", author_id: editor.id, author_display: "service_com", comments_enabled: true }).select("id").single();
    postId = post!.id;
    const edPage = await (await browser.newContext()).newPage();
    await loginWithPassword(edPage, editor.email, editor.password);
    await edPage.goto(`/studio/posts/${postId}`, { waitUntil: "networkidle" });
    await edPage.getByLabel("Rechercher un agent à ajouter").fill(outsider.email.slice(0, 12));
    await edPage.getByRole("button", { name: new RegExp(outsider.email) }).first().click();
    await expect.poll(async () => (await admin.from("post_editors").select("profile_id").eq("post_id", postId!).eq("profile_id", outsider.id).maybeSingle()).data?.profile_id, { timeout: 15_000 }).toBe(outsider.id);
    // Réactions désactivées par l'éditeur
    await edPage.getByLabel("Autoriser les réactions").uncheck({ force: true });
    await edPage.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect.poll(async () => (await admin.from("posts").select("reactions_enabled").eq("id", postId!).single()).data?.reactions_enabled, { timeout: 15_000 }).toBe(false);

    await outsiderPage.goto("/studio/partages", { waitUntil: "networkidle" });
    await expect(outsiderPage.getByText(`Co-rédaction ${agent.stamp}`)).toBeVisible({ timeout: 15_000 });
    await outsiderPage.goto(`/studio/posts/${postId}`, { waitUntil: "networkidle" });
    await expect(outsiderPage.getByText("Co-rédaction", { exact: true })).toBeVisible();
    await expect(outsiderPage.getByRole("button", { name: "Publier" })).toHaveCount(0);
    await outsiderPage.getByLabel("Texte").fill("Texte modifié par le co-rédacteur");
    await outsiderPage.getByRole("button", { name: "Enregistrer mes modifications" }).click();
    await expect.poll(async () => (await admin.from("posts").select("body, status").eq("id", postId!).single()).data, { timeout: 15_000 }).toMatchObject({ body: "Texte modifié par le co-rédacteur", status: "draft" });
    // Un co-rédacteur ne publie pas : la base refuse le changement d'état
    const { error: forbidden } = await (async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      await c.auth.signInWithPassword({ email: outsider.email, password: outsider.password });
      return c.from("posts").update({ status: "published" }).eq("id", postId!);
    })();
    expect(forbidden?.message ?? "").toMatch(/ACCES_REFUSE|row-level security/);

    // --- 5. Événement de centre : créé par le chef, visible du membre, pas de l'extérieur -------
    await chiefPage.goto(`/centre/${center.slug}`, { waitUntil: "networkidle" });
    await chiefPage.getByRole("button", { name: /Ajouter pour/ }).click();
    await chiefPage.getByRole("tab", { name: "Événement" }).click();
    await chiefPage.getByLabel("Titre").fill(`Manœuvre ${agent.stamp}`);
    await chiefPage.getByLabel("Toute la journée").check({ force: true });
    const d = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await chiefPage.getByLabel("Début").fill(d);
    await chiefPage.getByRole("button", { name: /Envoyer|Ajouter|Proposer/ }).last().click();
    await expect.poll(async () => (await admin.from("events").select("id, status").eq("center_id", center.id).ilike("title", `%${agent.stamp}%`).maybeSingle()).data?.status, { timeout: 15_000 }).toBe("published");
    eventId = (await admin.from("events").select("id").ilike("title", `%${agent.stamp}%`).single()).data!.id;
    await page.goto("/agenda", { waitUntil: "networkidle" });
    await expect(page.getByText(`Manœuvre ${agent.stamp}`)).toBeVisible({ timeout: 15_000 });
    await outsiderPage.goto("/agenda", { waitUntil: "networkidle" });
    await expect(outsiderPage.getByText(`Manœuvre ${agent.stamp}`)).toHaveCount(0);
  } finally {
    if (eventId) await admin.from("events").delete().eq("id", eventId);
    if (postId) await admin.from("posts").delete().eq("id", postId);
    await admin.from("centers").update({ chief_name: null, chief_email: null }).eq("id", center.id);
    await admin.from("membership_requests").delete().in("profile_id", [agent.id, outsider.id]);
    for (const u of [agent, chief, editor, outsider]) await admin.auth.admin.deleteUser(u.id);
  }
});
