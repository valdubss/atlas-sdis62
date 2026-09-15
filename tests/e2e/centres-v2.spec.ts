import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Lot 7 : changement de centre en un écran (historique daté), fiche .vcf,
 * propositions de fiche multi-champs décidées champ par champ par la com.
 */
test("centres v2 : changement de centre, vCard, propositions de fiche", async ({ browser }) => {
  test.setTimeout(180_000);
  const agent = await createTestUser(admin, "centre-v2");
  const referent = await createTestUser(admin, "ref-v2");
  const editor = await createTestUser(admin, "ed-v2");
  await admin.from("profiles").update({ role: "editor" }).eq("id", editor.id);
  const { data: centers } = await admin.from("centers").select("id, slug, name, phone").eq("type", "cis").eq("is_active", true).order("name").limit(2);
  test.skip(!centers || centers.length < 2, "Deux centres actifs nécessaires.");
  const [a, b] = centers!;
  await admin.from("profiles").update({ center_id: a.id }).eq("id", agent.id);
  await admin.from("center_referents").insert({ center_id: b.id, profile_id: referent.id });
  const originalPhone = b.phone;

  try {
    // --- Changement de centre depuis le profil ------------------------------------
    const page = await (await browser.newContext()).newPage();
    await loginWithPassword(page, agent.email, agent.password);
    await page.goto("/profil/centre", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Changer" }).click();
    await page.getByLabel("Rechercher un centre").fill(b.name);
    await page.getByRole("button", { name: new RegExp(b.name) }).first().click();
    await expect(page.getByText(`Nouveau rattachement : ${b.name}`)).toBeVisible();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect.poll(async () => (await admin.from("profiles").select("center_id").eq("id", agent.id).maybeSingle()).data?.center_id, { timeout: 15_000 }).toBe(b.id);
    const { data: hist } = await admin.from("profile_history").select("field, old_value, new_value").eq("profile_id", agent.id).order("changed_at", { ascending: false }).limit(1);
    expect(hist?.[0]).toMatchObject({ field: "center_id", old_value: a.id, new_value: b.id });
    await expect(page.getByText(/Historique/)).toBeVisible({ timeout: 15_000 });

    // --- vCard du centre ------------------------------------------------------------
    const res = await page.request.get(`/api/annuaire/vcard/centre/${a.slug}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/vcard");
    expect(await res.text()).toContain(`FN:${a.name}`);

    // --- Propositions de fiche (référent) puis décision (éditeur) --------------------
    const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const asRef = anon();
    await asRef.auth.signInWithPassword({ email: referent.email, password: referent.password });
    const { data: n, error: propErr } = await asRef.rpc("propose_center_changes", { p_center: b.id, p_changes: [{ field: "phone", value: "03 21 00 00 99" }, { field: "presentation", value: "Présentation de test" }] });
    expect(propErr).toBeNull();
    expect(n).toBe(2);
    // L'agent non référent ne peut rien proposer
    const asAgent = anon();
    await asAgent.auth.signInWithPassword({ email: agent.email, password: agent.password });
    const { error: deniedErr } = await asAgent.rpc("propose_center_changes", { p_center: a.id, p_changes: [{ field: "phone", value: "x" }] });
    expect(deniedErr).not.toBeNull();
    const { data: changes } = await admin.from("center_changes").select("id, field").eq("center_id", b.id).eq("decision", "pending");
    const phoneChange = changes!.find((c) => c.field === "phone")!;
    const presChange = changes!.find((c) => c.field === "presentation")!;
    const asEd = anon();
    await asEd.auth.signInWithPassword({ email: editor.email, password: editor.password });
    expect((await asEd.rpc("decide_center_change", { p_id: phoneChange.id, p_accept: true })).error).toBeNull();
    expect((await asEd.rpc("decide_center_change", { p_id: presChange.id, p_accept: false, p_note: "Trop court" })).error).toBeNull();
    const { data: after } = await admin.from("centers").select("phone, pending_presentation").eq("id", b.id).maybeSingle();
    expect(after?.phone).toBe("03 21 00 00 99");
    expect(after?.pending_presentation).toBeNull();
    const { data: notif } = await admin.from("notifications").select("title").eq("user_id", referent.id).eq("kind", "center");
    expect((notif ?? []).map((x) => x.title)).toEqual(expect.arrayContaining(["Modification de fiche appliquée", "Modification de fiche non retenue"]));
  } finally {
    await admin.from("centers").update({ phone: originalPhone, pending_presentation: null, pending_cover_media_id: null, pending_by: null, pending_at: null }).eq("id", b.id);
    await admin.from("center_changes").delete().eq("center_id", b.id).in("proposed_by", [referent.id]);
    await admin.from("center_referents").delete().eq("profile_id", referent.id);
    await admin.from("notifications").delete().in("user_id", [agent.id, referent.id, editor.id]);
    for (const u of [agent, referent, editor]) await admin.auth.admin.deleteUser(u.id);
  }
});
