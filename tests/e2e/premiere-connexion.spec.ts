import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { adminClient, completeOnboarding, loadEnv } from "./helpers";

/**
 * Première connexion par matricule (réglage auth_first_access = "registry") :
 *  1. matricule absent du référentiel → refusé avant tout envoi ;
 *  2. matricule référencé → mot de passe temporaire « envoyé » (capturé dans EMAIL_CAPTURE_DIR) ;
 *  3. connexion par matricule + mot de passe temporaire → accueil (nom, statut, centre, mot de
 *     passe personnel) → fil, profil complété ;
 *  4. reconnexion par e-mail avec le nouveau mot de passe.
 * Le réglage est remis à sa valeur initiale à la fin.
 */
test("première connexion par matricule : refus, mot de passe temporaire, accueil, connexion", async ({ page }) => {
  const env = loadEnv();
  const captureDir = env.EMAIL_CAPTURE_DIR;
  test.skip(!captureDir, "EMAIL_CAPTURE_DIR absent du fichier d'environnement (capture des e-mails)");
  const admin = adminClient(env);
  const stamp = Date.now().toString(36);
  const matricule = `E2E${stamp}`.toUpperCase();
  const email = `e2e-pc-${stamp}@sdis62.fr`;
  const personal = `e2e-pc-${stamp}@exemple.org`;
  const { data: before } = await admin.from("app_settings").select("value").eq("key", "auth_first_access").maybeSingle();
  let userId: string | null = null;

  const openFirstAccess = async () => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Première connexion" }).click();
    await page.getByLabel("Adresse e-mail SDIS").fill(email);
    await page.getByLabel("Adresse e-mail personnelle").fill(personal);
  };

  try {
    await admin.from("app_settings").upsert({ key: "auth_first_access", value: "registry" });
    await admin.from("agents_registry").upsert({ matricule, email, last_name: `Référencé ${stamp}`, first_name: "Agent", center_name: "Lumbres", status: "spp" });
    await admin.from("rate_limit_events").delete().eq("bucket", "first_access");

    // --- 1. Matricule inconnu : refusé -----------------------------------------------------
    await openFirstAccess();
    await page.getByLabel("Matricule").fill(`X${stamp}`);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(/n'est pas référencé/)).toBeVisible({ timeout: 15_000 });
    expect((await admin.from("profiles").select("id").ilike("email", email).maybeSingle()).data).toBeNull();

    // --- 2. Matricule référencé : mot de passe temporaire ------------------------------------
    await page.getByLabel("Matricule").fill(matricule.toLowerCase());
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText("Mot de passe temporaire envoyé")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "J'ai reçu mon mot de passe" }).click();
    const { data: created } = await admin.from("profiles").select("id, matricule, personal_email, status, first_name, last_name").ilike("email", email).single();
    userId = created.id;
    expect(created).toMatchObject({ matricule, personal_email: personal, status: "spp", first_name: "Agent" });

    // E-mail capturé : le mot de passe temporaire (XXXX-XXXX-XXXX)
    const dir = path.resolve(process.cwd(), captureDir!);
    const file = fs
      .readdirSync(dir)
      .filter((f) => f.includes(personal))
      .sort()
      .pop();
    expect(file, "e-mail capturé").toBeTruthy();
    const mail = JSON.parse(fs.readFileSync(path.join(dir, file!), "utf8")) as { to: string; subject: string; text: string };
    expect(mail.to).toBe(personal);
    const temp = mail.text.match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
    expect(temp, "mot de passe temporaire dans l'e-mail").toBeTruthy();

    // --- 3. Connexion par matricule, accueil ---------------------------------------------
    await expect(page.getByLabel("Adresse e-mail ou matricule")).toHaveValue(email);
    await page.getByLabel("Adresse e-mail ou matricule").fill(matricule.toLowerCase());
    await page.getByRole("textbox", { name: "Mot de passe" }).fill(temp!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/\/bienvenue/, { timeout: 20_000 });
    await expect(page.getByText(matricule)).toBeVisible();
    const newPassword = `Perso-${stamp}-Mdp1`;
    await completeOnboarding(page, { firstName: "Agent", lastName: `Référencé ${stamp}`, password: newPassword, status: "SPV" });
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
    await expect.poll(async () => (await admin.from("profiles").select("status, onboarded_at, password_set_at").eq("id", userId!).single()).data, { timeout: 10_000 }).toMatchObject({ status: "spv" });
    const { data: done } = await admin.from("profiles").select("onboarded_at, password_set_at").eq("id", userId).single();
    expect(done.onboarded_at).not.toBeNull();
    expect(done.password_set_at).not.toBeNull();

    // --- 4. Reconnexion par e-mail avec le mot de passe personnel ---------------------------
    await page.goto("/auth/deconnexion", { waitUntil: "networkidle" }).catch(() => {});
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Adresse e-mail ou matricule").fill(email);
    await page.getByRole("textbox", { name: "Mot de passe" }).fill(newPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
  } finally {
    await admin.from("app_settings").upsert({ key: "auth_first_access", value: before?.value ?? "link" });
    await admin.from("agents_registry").delete().eq("matricule", matricule);
    await admin.from("rate_limit_events").delete().eq("bucket", "first_access");
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (captureDir && fs.existsSync(captureDir)) for (const f of fs.readdirSync(captureDir)) if (f.includes(personal)) fs.rmSync(path.join(captureDir, f), { force: true });
  }
});
