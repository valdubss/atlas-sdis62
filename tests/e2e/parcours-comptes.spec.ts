import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createTestUser, loadEnv, loginWithPassword, magicLink } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Parcours de bout en bout d'un compte : un agent @sdis62.fr inconnu arrive par
 * le lien de connexion (le compte est créé comme le fait l'écran de connexion),
 * passe l'accueil, voit le fil ; le code à six chiffres du même e-mail est accepté ;
 * un administrateur change son rôle dans Studio → Utilisateurs et crée un compte.
 * (L'envoi de l'e-mail lui-même dépend du transport configuré : Resend en production.)
 */
test("parcours comptes : nouvel agent par lien et code, accueil, fil ; administrateur : rôle et création", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const newEmail = `e2e-nouvel-agent-${stamp}@sdis62.fr`;
  const createdEmail = `e2e-cree-${stamp}@sdis62.fr`;
  const superUser = await createTestUser(admin, "adm");
  await admin.from("profiles").update({ role: "admin" }).eq("id", superUser.id);
  let newId: string | null = null;
  let createdId: string | null = null;
  const { data: post } = await admin
    .from("posts")
    .insert({ type: "text", title: `Bienvenue ${stamp}`, body: "Publication visible par tous les agents.", status: "published", published_at: new Date().toISOString(), author_id: superUser.id, author_display: "service_com" })
    .select("id")
    .single();

  try {
    // --- 1. Compte créé à la demande de connexion (même appel que l'écran de connexion) ----
    const { data: created, error } = await admin.auth.admin.createUser({ email: newEmail, email_confirm: true });
    expect(error).toBeNull();
    newId = created.user!.id;
    expect((await admin.from("profiles").select("role, onboarded_at").eq("id", newId).single()).data).toMatchObject({ role: "reader", onboarded_at: null });
    // Domaine non autorisé : refusé par la base
    const bad = await admin.auth.admin.createUser({ email: `e2e-${stamp}@exemple.org`, email_confirm: true });
    expect(bad.error).not.toBeNull();

    // --- 2. Lien de l'e-mail : accueil, identité, fil ---------------------------------------
    const page = await (await browser.newContext()).newPage();
    await page.goto(await magicLink(env, baseURL!, newEmail), { waitUntil: "networkidle" });
    await page.waitForURL(/\/bienvenue/, { timeout: 20_000 });
    // Écrans de présentation puis configuration
    for (let i = 0; i < 6; i++) {
      const next = page.getByRole("button", { name: /^(Suivant|Configurer)$/ });
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(250);
    }
    await page.getByLabel("Prénom").fill("Nouvel");
    await page.getByLabel("Nom", { exact: true }).fill(`Agent ${stamp}`);
    // Mot de passe obligatoire à la première connexion
    const newPassword = `Nouveau-${stamp}-Mdp1`;
    await page.getByLabel("Mot de passe", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirmer le mot de passe").fill(newPassword);
    await page.getByRole("button", { name: "Commencer" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
    await expect(page.getByRole("article", { name: `Bienvenue ${stamp}` })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await admin.from("profiles").select("onboarded_at, last_name").eq("id", newId!).single()).data?.last_name, { timeout: 10_000 }).toBe(`Agent ${stamp}`);

    // --- 3. Code à six chiffres (celui de l'e-mail) accepté --------------------------------
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: newEmail });
    const otp = link?.properties?.email_otp;
    expect(otp).toMatch(/^\d{6}$/);
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const verified = await anon.auth.verifyOtp({ email: newEmail, token: otp!, type: "email" });
    expect(verified.error).toBeNull();
    expect(verified.data.user?.email).toBe(newEmail);

    // --- 4. Administrateur : Studio → Utilisateurs, rôle éditeur, création d'un compte -----
    const a = await (await browser.newContext()).newPage();
    await loginWithPassword(a, superUser.email, superUser.password);
    await a.goto("/admin/utilisateurs", { waitUntil: "networkidle" });
    await a.getByLabel("Rechercher").fill(newEmail);
    await a.keyboard.press("Enter");
    // La ligne (pas la case « Sélectionner … » des actions groupées) ouvre la fiche
    await a.getByRole("button", { name: new RegExp(`^Nouvel Agent ${stamp}`) }).first().click();
    await a.getByRole("button", { name: "Éditeur", exact: true }).click();
    await expect.poll(async () => (await admin.from("profiles").select("role").eq("id", newId!).single()).data?.role, { timeout: 15_000 }).toBe("editor");
    // L'agent devenu éditeur voit le bouton « + » (Studio) après rafraîchissement
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /Publier|Créer|Nouveau/ }).first()).toBeVisible({ timeout: 15_000 });

    await a.goto("/admin/utilisateurs", { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "Créer un compte" }).click();
    await a.getByLabel("Adresse e-mail").fill(createdEmail);
    await a.getByLabel("Prénom").fill("Compte");
    await a.getByLabel("Nom", { exact: true }).fill(`Créé ${stamp}`);
    await a.getByLabel("Rôle").selectOption("editor");
    await a.getByText("Définir un mot de passe initial").click();
    await a.getByRole("button", { name: "Créer le compte" }).click();
    await expect.poll(async () => (await admin.from("profiles").select("id, role").ilike("email", createdEmail).maybeSingle()).data?.role ?? null, { timeout: 15_000 }).toBe("editor");
    createdId = (await admin.from("profiles").select("id").ilike("email", createdEmail).single()).data!.id;
  } finally {
    if (post) await admin.from("posts").delete().eq("id", post.id);
    await admin.from("notifications").delete().ilike("body", `%${stamp}%`);
    for (const id of [newId, createdId, superUser.id]) if (id) await admin.auth.admin.deleteUser(id);
  }
});
