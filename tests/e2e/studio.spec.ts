import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword, magicLink } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);
const ADMIN_EMAIL = env.E2E_ADMIN_EMAIL ?? (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();

/**
 * Brouillon partagé : le second éditeur voit le verrou et ne peut prendre la main
 * qu'après 10 min d'inactivité (simulée en base) ; relecture demandée → publication
 * bloquée → validation → publication possible ; calendrier : le brouillon est « Sans date ».
 */
test("studio : verrou d'édition, relecture, calendrier", async ({ browser, baseURL }) => {
  test.skip(!ADMIN_EMAIL, "E2E_ADMIN_EMAIL ou ALLOWED_EMAILS requis");
  const editor = await createTestUser(admin, "editeur");
  await admin.from("profiles").update({ role: "editor" }).eq("id", editor.id);
  const { stamp } = editor;
  const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", ADMIN_EMAIL!).single();
  const { data: post } = await admin.from("posts").insert({ type: "text", title: `Brouillon test ${stamp}`, body: "Texte de départ", status: "draft", author_id: adminProfile!.id }).select("id").single();
  const postId = post!.id;

  try {
    // Éditeur A (admin) ouvre le brouillon → verrou
    const a = await (await browser.newContext()).newPage();
    await a.goto(await magicLink(env, baseURL!, ADMIN_EMAIL!), { waitUntil: "networkidle" });
    await a.goto(`/studio/posts/${postId}`, { waitUntil: "networkidle" });
    await expect(a.getByRole("button", { name: "Versions" })).toBeVisible();
    await expect.poll(async () => (await admin.from("posts").select("lock_by").eq("id", postId).single()).data?.lock_by).toBe(adminProfile!.id);

    // Éditeur B voit « Modifié par … », prise de main impossible
    const b = await (await browser.newContext()).newPage();
    await loginWithPassword(b, editor.email, editor.password);
    await b.goto(`/studio/posts/${postId}`, { waitUntil: "networkidle" });
    await expect(b.getByText(/Modifié par/)).toBeVisible({ timeout: 15_000 });
    await expect(b.getByRole("button", { name: "Prendre la main" })).toBeDisabled();

    // Après 10 min d'inactivité (simulées), le verrou est repris automatiquement à l'ouverture
    await admin.from("posts").update({ lock_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("id", postId);
    await b.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => (await admin.from("posts").select("lock_by").eq("id", postId).single()).data?.lock_by, { timeout: 15_000 }).toBe(editor.id);
    await expect(b.getByText(/Modifié par/)).toHaveCount(0);

    // Sauvegarde automatique : le titre modifié par B est enregistré sans bouton, et versionné
    await b.getByLabel("Titre (facultatif)").fill(`Brouillon test ${stamp} relu`);
    await expect.poll(async () => (await admin.from("posts").select("title").eq("id", postId).single()).data?.title, { timeout: 20_000 }).toBe(`Brouillon test ${stamp} relu`);
    await expect.poll(async () => (await admin.from("post_versions").select("version").eq("post_id", postId)).data?.length ?? 0).toBeGreaterThanOrEqual(2);

    // Relecture demandée à l'admin → B ne peut pas publier
    await b.getByRole("button", { name: "Demander une relecture" }).click();
    await expect(b.getByText("En relecture", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(b.getByRole("button", { name: "Publier", exact: true })).toBeDisabled();
    // Trigger : mise en ligne refusée tant que la relecture n'est pas validée (hors admin)
    const bClient = (await import("@supabase/supabase-js")).createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await bClient.auth.signInWithPassword({ email: editor.email, password: editor.password });
    const { error: publishError } = await bClient.from("posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", postId);
    expect(publishError?.message ?? "").toContain("RELECTURE_EN_COURS");

    // L'admin valide : B peut publier
    await a.reload({ waitUntil: "networkidle" });
    await a.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(a.getByText("Relecture validée", { exact: true })).toBeVisible({ timeout: 15_000 });
    await b.reload({ waitUntil: "networkidle" });
    await expect(b.getByRole("button", { name: "Publier", exact: true })).toBeEnabled({ timeout: 15_000 });

    // Calendrier : le brouillon apparaît dans « Sans date »
    await a.goto("/studio/calendrier", { waitUntil: "networkidle" });
    await expect(a.locator("[data-day='undated']").getByText(`Brouillon test ${stamp} relu`)).toBeVisible();
  } finally {
    await admin.from("notifications").delete().ilike("body", `%${stamp}%`);
    await admin.from("posts").delete().eq("id", postId);
    await admin.auth.admin.deleteUser(editor.id);
  }
});
