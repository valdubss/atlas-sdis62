import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { adminClient, completeOnboarding, loadEnv } from "./helpers";

/**
 * Première connexion par matricule (réglage auth_first_access = "registry") :
 *  1. matricule absent du référentiel → refusé avant tout envoi ;
 *  2. matricule référencé → code à six chiffres « envoyé » sur l'adresse personnelle
 *     (capturé dans EMAIL_CAPTURE_DIR, repris dans l'objet) → saisi → accueil ;
 *  3. accueil : « Bienvenue Prénom Nom », statut, centre obligatoire (centre de test sans chef),
 *     mot de passe → retour à l'écran de connexion « compte prêt » ;
 *  4. connexion par matricule, puis par adresse SDIS indicative ;
 *  5. mot de passe oublié par matricule : code sur l'adresse personnelle, affichée masquée.
 * Le réglage est remis à sa valeur initiale, le centre et le compte supprimés.
 */
test("première connexion par matricule : refus, code, accueil, connexion, mot de passe oublié", async ({ page }) => {
  const env = loadEnv();
  const captureDir = env.EMAIL_CAPTURE_DIR;
  test.skip(!captureDir, "EMAIL_CAPTURE_DIR absent du fichier d'environnement (capture des e-mails)");
  const admin = adminClient(env);
  const stamp = Date.now().toString(36);
  const matricule = `E2E${stamp}`.toUpperCase();
  const sdisEmail = `e2e-pc-${stamp}@sdis62.fr`;
  const personal = `e2e-pc-${stamp}@exemple.org`;
  const dir = path.resolve(process.cwd(), captureDir!);
  const { data: before } = await admin.from("app_settings").select("value").eq("key", "auth_first_access").maybeSingle();
  let userId: string | null = null;
  let centerId: string | null = null;

  /** Dernier e-mail capturé pour l'adresse personnelle : code à six chiffres lu dans l'objet. */
  const lastCode = (after: number) => {
    const file = fs
      .readdirSync(dir)
      .filter((f) => f.includes(personal) && Number(f.split("-")[0]) >= after)
      .sort()
      .pop();
    expect(file, "e-mail capturé").toBeTruthy();
    const mail = JSON.parse(fs.readFileSync(path.join(dir, file!), "utf8")) as { to: string; subject: string; text: string };
    expect(mail.to).toBe(personal);
    const code = mail.subject.match(/\b(\d{6})\b/)?.[1];
    expect(code, "code dans l'objet").toBeTruthy();
    return code!;
  };
  const login = async (p: Page, identifier: string, password: string) => {
    await p.goto("/login", { waitUntil: "networkidle" });
    await p.getByLabel("Adresse e-mail ou matricule").fill(identifier);
    await p.getByRole("textbox", { name: "Mot de passe" }).fill(password);
    await p.getByRole("button", { name: "Se connecter" }).click();
    await p.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
  };

  try {
    await admin.from("app_settings").upsert({ key: "auth_first_access", value: "registry" });
    await admin.from("agents_registry").upsert({ matricule, email: null, last_name: `Référencé ${stamp}`, first_name: "Agent", center_name: "Test", status: "spp" });
    await admin.from("rate_limit_events").delete().in("bucket", ["first_access", "magiclink"]);
    const { data: center } = await admin.from("centers").insert({ slug: `e2e-pc-${stamp}`, name: `CIS Test ${stamp}`, type: "cis", city: "Arras", sort_order: 999 }).select("id").single();
    centerId = center!.id;

    // --- 1. Matricule inconnu : refusé, aucun compte créé ---------------------------------
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Première connexion" }).click();
    await page.getByLabel("Adresse e-mail SDIS").fill(sdisEmail);
    await page.getByLabel("Matricule").fill(`X${stamp}`);
    await page.getByLabel("Adresse e-mail personnelle").fill(personal);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(/n'est pas référencé/)).toBeVisible({ timeout: 15_000 });
    expect((await admin.from("profiles").select("id").ilike("email", personal).maybeSingle()).data).toBeNull();

    // --- 2. Matricule référencé : code reçu sur l'adresse personnelle ----------------------
    const t0 = Date.now();
    await page.getByLabel("Matricule").fill(matricule.toLowerCase());
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText("Code envoyé")).toBeVisible({ timeout: 20_000 });
    const { data: created } = await admin.from("profiles").select("id, email, matricule, personal_email, status, first_name, last_name, password_set_at").ilike("email", personal).single();
    userId = created.id;
    expect(created).toMatchObject({ matricule, personal_email: personal, status: "spp", first_name: "Agent", last_name: `Référencé ${stamp}`, password_set_at: null });
    const { data: ref } = await admin.from("agents_registry").select("email, personal_email").eq("matricule", matricule).single();
    expect(ref).toMatchObject({ email: sdisEmail, personal_email: personal });
    await page.getByLabel("Code reçu par e-mail").fill(lastCode(t0));
    await page.getByRole("button", { name: "Valider le code" }).click();
    await page.waitForURL(/\/bienvenue/, { timeout: 20_000 });

    // --- 3. Accueil : bienvenue nominatif, statut, centre obligatoire, mot de passe ----------
    await expect(page.getByRole("heading", { name: `Bienvenue Agent Référencé ${stamp}` })).toBeVisible();
    await expect(page.getByText(matricule)).toBeVisible();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("radio", { name: "SPV" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.getByText("Choisissez votre centre ou votre service.")).toBeVisible();
    await page.getByRole("button", { name: /Choisir mon centre/ }).click();
    await page.getByRole("dialog").getByLabel("Rechercher un centre").fill(`CIS Test ${stamp}`);
    await page.getByRole("dialog").getByText(`CIS Test ${stamp}`).first().click();
    const newPassword = `Perso-${stamp}-Mdp1`;
    await completeOnboarding(page, { firstName: "Agent", lastName: `Référencé ${stamp}`, password: newPassword });
    await page.waitForURL(/\/login\?pret=1/, { timeout: 20_000 });
    await expect(page.getByText("Votre compte est prêt")).toBeVisible();
    const { data: done } = await admin.from("profiles").select("status, onboarded_at, password_set_at").eq("id", userId).single();
    expect(done.status).toBe("spv");
    expect(done.onboarded_at).not.toBeNull();
    expect(done.password_set_at).not.toBeNull();
    const { data: req } = await admin.from("membership_requests").select("status, center_id").eq("profile_id", userId).maybeSingle();
    expect(req).toMatchObject({ status: "pending", center_id: centerId });
    expect((await admin.from("agents_registry").select("activated_at").eq("matricule", matricule).single()).data?.activated_at).not.toBeNull();

    // --- 4. Connexion par matricule, puis par adresse SDIS indicative -----------------------
    await login(page, matricule.toLowerCase(), newPassword);
    await page.goto("/auth/deconnexion", { waitUntil: "networkidle" }).catch(() => {});
    await login(page, sdisEmail, newPassword);
    await page.goto("/auth/deconnexion", { waitUntil: "networkidle" }).catch(() => {});

    // Un second passage par « Première connexion » est refusé (compte accueilli)
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Première connexion" }).click();
    await page.getByLabel("Adresse e-mail SDIS").fill(sdisEmail);
    await page.getByLabel("Matricule").fill(matricule);
    await page.getByLabel("Adresse e-mail personnelle").fill(personal);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(/Un compte existe déjà/)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");

    // --- 5. Mot de passe oublié par matricule : code, adresse masquée, nouveau mot de passe --
    const t1 = Date.now();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
    await page.getByLabel("E-mail ou matricule").fill(matricule);
    await page.getByRole("button", { name: "Recevoir le code" }).click();
    await expect(page.getByText("E-mail envoyé")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(personal, { exact: false })).toHaveCount(0);
    await page.getByLabel("Code reçu par e-mail").fill(lastCode(t1));
    await page.getByRole("button", { name: "Valider le code" }).click();
    await page.waitForURL(/\/bienvenue/, { timeout: 20_000 });
    const resetPassword = `Reset-${stamp}-Mdp2`;
    await page.getByLabel("Prénom").fill("Agent");
    await page.getByLabel("Nom", { exact: true }).fill(`Référencé ${stamp}`);
    await completeOnboarding(page, { firstName: "Agent", lastName: `Référencé ${stamp}`, password: resetPassword });
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
    await page.goto("/auth/deconnexion", { waitUntil: "networkidle" }).catch(() => {});
    await login(page, personal, resetPassword);
  } finally {
    await admin.from("app_settings").upsert({ key: "auth_first_access", value: before?.value ?? "link" });
    await admin.from("agents_registry").delete().eq("matricule", matricule);
    await admin.from("rate_limit_events").delete().in("bucket", ["first_access", "magiclink"]);
    await admin.from("notifications").delete().ilike("title", `%${stamp}%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (centerId) await admin.from("centers").delete().eq("id", centerId);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.includes(personal)) fs.rmSync(path.join(dir, f), { force: true });
  }
});
