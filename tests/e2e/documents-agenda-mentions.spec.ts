import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/** PDF minimal valide (une page vide). */
function samplePdf(): string {
  const out = path.join(os.tmpdir(), "atlas-e2e-doc.pdf");
  if (!fs.existsSync(out)) {
    fs.writeFileSync(out, "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  }
  return out;
}

/**
 * Documents utiles (ajout par le service com, visibles des agents, « garder hors ligne »),
 * participation à un événement (compteur, liste nominative pour l'éditeur) et mention « @ »
 * dans un commentaire (notification de la personne citée).
 */
test("documents, participation à l'agenda, mention dans un commentaire", async ({ browser }) => {
  test.setTimeout(180_000);
  const editor = await createTestUser(admin, "ed");
  await admin.from("profiles").update({ role: "editor" }).eq("id", editor.id);
  const agent = await createTestUser(admin, "agent");
  const stamp = editor.stamp;
  let docId: string | null = null;
  let eventId: string | null = null;
  let postId: string | null = null;
  const e = await (await browser.newContext()).newPage();
  const a = await (await browser.newContext()).newPage();
  try {
    // --- Documents : ajout par l'éditeur ------------------------------------------------------
    await loginWithPassword(e, editor.email, editor.password);
    await e.goto("/admin/documents", { waitUntil: "networkidle" });
    await e.getByRole("button", { name: "Ajouter un document" }).click();
    await e.getByLabel("Titre").fill(`Fiche test ${stamp}`);
    await e.getByLabel("Catégorie", { exact: true }).fill(`Tests ${stamp}`);
    await e.locator("input[type=file]").setInputFiles(samplePdf());
    await e.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(e.getByText("Document ajouté")).toBeVisible({ timeout: 20_000 });
    docId = (await admin.from("documents").select("id").eq("title", `Fiche test ${stamp}`).single()).data!.id;

    // Agent : le document est visible, s'ouvre par l'adresse stable, se garde hors ligne
    await loginWithPassword(a, agent.email, agent.password);
    await a.goto("/documents", { waitUntil: "networkidle" });
    await expect(a.getByText(`Fiche test ${stamp}`)).toBeVisible();
    const file = await a.request.get(`/documents/f/${docId}`, { maxRedirects: 0 });
    expect(file.status()).toBe(302);
    expect(file.headers()["location"]).toContain("/documents/");
    await a.getByRole("button", { name: `Garder « Fiche test ${stamp} » hors ligne` }).click();
    await expect(a.getByText("hors ligne ✓")).toBeVisible({ timeout: 20_000 });

    // --- Agenda : « Je participe », compteur, liste nominative pour l'éditeur ------------------
    const starts = new Date(Date.now() + 2 * 86_400_000).toISOString();
    eventId = (await admin.from("events").insert({ title: `Manœuvre ${stamp}`, starts_at: starts, status: "published", author_id: editor.id }).select("id").single()).data!.id;
    await a.goto("/agenda", { waitUntil: "networkidle" });
    await a.getByRole("button", { name: new RegExp(`Manœuvre ${stamp}`) }).click();
    await a.getByRole("button", { name: "Participer" }).click();
    await expect(a.getByRole("button", { name: "Je participe" })).toBeVisible();
    await expect.poll(async () => (await admin.from("event_participations").select("user_id", { count: "exact", head: true }).eq("event_id", eventId!)).count ?? 0, { timeout: 10_000 }).toBe(1);
    await e.goto(`/studio/agenda/${eventId}`, { waitUntil: "networkidle" });
    await expect(e.getByText("Test agent")).toBeVisible({ timeout: 15_000 });

    // --- Mention dans un commentaire : notification de la personne citée -----------------------
    postId = (await admin.from("posts").insert({ type: "text", title: `Mention ${stamp}`, body: "Publication pour la mention.", status: "published", published_at: new Date().toISOString(), author_id: editor.id, author_display: "service_com" }).select("id, slug").single()).data!.id;
    const slug = (await admin.from("posts").select("slug").eq("id", postId).single()).data!.slug;
    await e.goto(`/post/${slug}`, { waitUntil: "networkidle" });
    const box = e.getByLabel("Votre commentaire");
    await box.fill("Bravo @Te");
    await e.getByRole("option").filter({ hasText: "Test agent" }).first().click();
    await expect(box).toHaveValue(/@Test agent/);
    await box.press("Enter");
    await expect.poll(async () => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", agent.id).eq("kind", "mention")).count ?? 0, { timeout: 15_000 }).toBe(1);
  } finally {
    if (postId) await admin.from("posts").delete().eq("id", postId);
    if (eventId) await admin.from("events").delete().eq("id", eventId);
    if (docId) {
      const { data: d } = await admin.from("documents").select("file_key").eq("id", docId).single();
      await admin.from("documents").delete().eq("id", docId);
      if (d?.file_key) await admin.storage.from("media").remove([d.file_key]);
    }
    await admin.from("notifications").delete().in("user_id", [agent.id, editor.id]);
    for (const u of [editor, agent]) await admin.auth.admin.deleteUser(u.id);
  }
});
