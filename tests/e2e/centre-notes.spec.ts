import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/** Un PDF minimal mais valide (une page vide). */
function tinyPdf() {
  const body = ["%PDF-1.4", "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj", "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj", "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj", "trailer << /Root 1 0 R >>", "%%EOF"].join("\n");
  return Buffer.from(body, "latin1");
}

/**
 * Notes de service : le responsable communication d'un centre publie un PDF
 * dans le fil interne ; un membre le voit (RLS + cloche), un agent d'un autre
 * centre ne voit ni l'onglet ni la note. Commentaires : feuille du fil,
 * commentaire, réponse, suppression.
 */
test("notes de service : publication par le responsable com, visibilité membres, commentaires du fil", async ({ browser }) => {
  test.setTimeout(240_000);
  const manager = await createTestUser(admin, "notes-com");
  const member = await createTestUser(admin, "notes-membre");
  const outsider = await createTestUser(admin, "notes-autre");
  const { stamp } = manager;
  const { data: centers } = await admin.from("centers").select("id, slug, name, com_email, com_name").eq("is_active", true).eq("type", "cis").order("name").limit(2);
  const center = centers?.[0];
  const other = centers?.[1];
  if (!center || !other) throw new Error("Deux centres actifs sont nécessaires");
  await admin.from("profiles").update({ center_id: center.id }).in("id", [manager.id, member.id]);
  await admin.from("profiles").update({ center_id: other.id }).eq("id", outsider.id);
  await admin.from("centers").update({ com_email: manager.email, com_name: "Test notes" }).eq("id", center.id);
  const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim() ?? "").maybeSingle();
  const { data: post } = await admin
    .from("posts")
    .insert({ type: "text", title: `Commentaires ${stamp}`, body: "Publication de test pour les commentaires.", status: "published", published_at: new Date().toISOString(), author_id: adminProfile?.id ?? manager.id })
    .select("id")
    .single();
  const postId = post!.id;
  const title = `Note de service ${stamp}`;

  try {
    // --- Responsable com : onglet « Notes de service », publication d'un PDF --------
    const m = await (await browser.newContext()).newPage();
    await loginWithPassword(m, manager.email, manager.password);
    await m.goto(`/centre/${center.slug}?onglet=notes`, { waitUntil: "networkidle" });
    await expect(m.getByText("Responsable communication", { exact: false }).first()).toBeVisible();
    await expect(m.getByRole("tab", { name: "Notes de service" })).toHaveAttribute("aria-selected", "true");
    await m.getByRole("button", { name: "Publier", exact: true }).click();
    await m.getByLabel("Document de la note").setInputFiles({ name: `note-${stamp}.pdf`, mimeType: "application/pdf", buffer: tinyPdf() });
    await expect(m.getByText(/PDF · \d+ Ko/)).toBeVisible({ timeout: 20_000 });
    await m.getByLabel("Titre").fill(title);
    await m.getByLabel("Texte (facultatif)").fill("Astreintes du mois : merci de lire le document.");
    await m.getByRole("button", { name: "Publier la note" }).click();
    await expect(m.getByRole("article", { name: `Note : ${title}` })).toBeVisible({ timeout: 20_000 });
    await expect(m.getByRole("article", { name: `Note : ${title}` }).getByText("Responsable communication")).toBeVisible();

    // --- Membre : la note est visible (RLS) et une notification est arrivée -----------
    const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const asMember = anon();
    await asMember.auth.signInWithPassword({ email: member.email, password: member.password });
    expect((await asMember.from("center_notes").select("id").eq("center_id", center.id)).data?.length).toBe(1);
    expect((await asMember.rpc("center_notes_list", { p_center: center.id })).data?.length).toBe(1);
    // Écriture refusée au simple membre
    const { error: insertErr } = await asMember.from("center_notes").insert({ center_id: center.id, title: "Interdit", kind: "pdf", file_key: `notes/${center.id}/x.pdf` });
    expect(insertErr).not.toBeNull();
    await expect.poll(async () => (await admin.from("notifications").select("id").eq("user_id", member.id).eq("kind", "note")).data?.length ?? 0, { timeout: 15_000 }).toBe(1);

    // --- Agent d'un autre centre : rien ------------------------------------------------
    const asOutsider = anon();
    await asOutsider.auth.signInWithPassword({ email: outsider.email, password: outsider.password });
    expect((await asOutsider.from("center_notes").select("id").eq("center_id", center.id)).data).toEqual([]);
    expect((await asOutsider.rpc("center_notes_list", { p_center: center.id })).data).toEqual([]);
    const o = await (await browser.newContext()).newPage();
    await loginWithPassword(o, outsider.email, outsider.password);
    await o.goto(`/centre/${center.slug}`, { waitUntil: "networkidle" });
    await expect(o.getByRole("tab", { name: "Notes de service" })).toHaveCount(0);

    // --- Commentaires : feuille du fil, commentaire, réponse, suppression -------------
    await m.goto("/", { waitUntil: "networkidle" });
    const card = m.getByRole("article", { name: `Commentaires ${stamp}` });
    await card.getByRole("button", { name: "Commentaires", exact: true }).click();
    const box = m.getByRole("textbox", { name: "Votre commentaire" });
    await box.fill(`Premier commentaire ${stamp}`);
    await m.getByRole("button", { name: "Publier le commentaire" }).click();
    await expect(m.getByText(`Premier commentaire ${stamp}`)).toBeVisible({ timeout: 15_000 });
    await m.getByRole("button", { name: "Répondre" }).first().click();
    await expect(m.getByText("Réponse à", { exact: false })).toBeVisible();
    await box.fill("Une réponse.");
    await m.getByRole("button", { name: "Publier le commentaire" }).click();
    await expect(m.getByText("Une réponse.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await admin.from("comments").select("id").eq("post_id", postId)).data?.length ?? 0, { timeout: 15_000 }).toBe(2);
    await expect(m.getByRole("dialog", { name: /Commentaires · 2/ })).toBeVisible();
    await m.getByRole("button", { name: "Supprimer" }).last().click();
    await m.getByRole("button", { name: "Supprimer", exact: true }).last().click();
    await expect.poll(async () => (await admin.from("comments").select("id").eq("post_id", postId)).data?.length ?? 0, { timeout: 15_000 }).toBe(1);
  } finally {
    const { data: notes } = await admin.from("center_notes").select("id").eq("center_id", center.id).eq("author_id", manager.id);
    if (notes?.length) await admin.from("center_notes").delete().in("id", notes.map((n) => n.id));
    await admin.from("centers").update({ com_email: center.com_email, com_name: center.com_name }).eq("id", center.id);
    await admin.from("posts").delete().eq("id", postId);
    await admin.from("notifications").delete().ilike("body", `%${stamp}%`);
    await admin.from("notifications").delete().eq("kind", "note").in("user_id", [member.id, manager.id]);
    const { data: queue } = await admin.from("notification_queue").select("id, payload").in("status", ["pending", "processing"]);
    const ids = (queue ?? []).filter((q) => notes?.some((n) => n.id === (q.payload as { note_id?: string })?.note_id) || (q.payload as { post_id?: string })?.post_id === postId).map((q) => q.id);
    if (ids.length) await admin.from("notification_queue").delete().in("id", ids);
    for (const u of [manager, member, outsider]) await admin.auth.admin.deleteUser(u.id);
  }
});
