import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Messagerie : un éditeur crée un groupe en deux écrans, envoie un message,
 * l'invité répond et réagit, l'éditeur voit l'accusé ; RLS : le référent ne
 * crée pas de groupe, l'agent non invité n'a accès à rien, un membre ne
 * modifie pas la liste des membres.
 */
test("messagerie : groupe, message, réaction, accusé et cloisonnement", async ({ browser }) => {
  test.setTimeout(240_000);
  const editor = await createTestUser(admin, "editeur-msg");
  await admin.from("profiles").update({ role: "editor" }).eq("id", editor.id);
  const guest = await createTestUser(admin, "invite-msg");
  const outsider = await createTestUser(admin, "agent-msg");
  const referent = await createTestUser(admin, "referent-msg");
  const { data: center } = await admin.from("centers").select("id").eq("is_active", true).limit(1).maybeSingle();
  if (center) await admin.from("center_referents").insert({ center_id: center.id, profile_id: referent.id });
  const { stamp } = editor;
  const groupName = `Groupe ${stamp}`;
  let channelId: string | null = null;

  try {
    // --- Éditeur : création du groupe en deux écrans -------------------------
    const e = await (await browser.newContext()).newPage();
    await loginWithPassword(e, editor.email, editor.password);
    await e.goto("/messages", { waitUntil: "networkidle" });
    await expect(e.getByRole("heading", { name: "Messages" }).first()).toBeVisible();
    await e.getByRole("link", { name: "Nouveau groupe" }).click();
    await e.getByLabel("Rechercher une personne").fill("invite-msg");
    await e.getByRole("button", { name: new RegExp(`Test invite-msg`) }).click();
    await e.getByRole("button", { name: /Suivant \(1\)/ }).click();
    await e.getByLabel("Nom du groupe").fill(groupName);
    await e.getByLabel("Objet du groupe").fill("Préparer la journée portes ouvertes");
    await e.getByRole("button", { name: "Créer le groupe" }).click();
    await e.waitForURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    channelId = e.url().split("/").pop()!;

    // Message texte avec mention
    await e.getByRole("textbox", { name: "Message" }).fill(`Bonjour @Test invite-msg, on part sur ${stamp} ?`);
    await e.getByRole("button", { name: "Envoyer" }).click();
    await expect(e.locator("p").filter({ hasText: `on part sur ${stamp} ?` })).toBeVisible({ timeout: 15_000 });
    await expect(e.getByText("Envoyé")).toBeVisible({ timeout: 15_000 });

    // --- Invité : lit, répond, réagit --------------------------------------
    const g = await (await browser.newContext()).newPage();
    await loginWithPassword(g, guest.email, guest.password);
    await g.goto("/messages", { waitUntil: "networkidle" });
    await g.getByRole("link", { name: new RegExp(groupName) }).click();
    await expect(g.locator("p").filter({ hasText: `on part sur ${stamp} ?` })).toBeVisible({ timeout: 15_000 });
    // Mention → notification dans l'app
    await expect.poll(async () => (await admin.from("notifications").select("id").eq("user_id", guest.id).eq("kind", "message")).data?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    await g.getByRole("textbox", { name: "Message" }).fill("Oui, partant !");
    await g.getByRole("button", { name: "Envoyer" }).click();
    await expect(g.locator("p").filter({ hasText: "Oui, partant !" })).toBeVisible({ timeout: 15_000 });
    // Réaction sur le message de l'éditeur (menu contextuel = appui long)
    await g.locator("p").filter({ hasText: `on part sur ${stamp} ?` }).click({ button: "right" });
    await g.getByRole("button", { name: "Réagir 👍" }).click();
    await expect.poll(async () => (await admin.from("message_reactions").select("emoji").eq("profile_id", guest.id)).data?.length ?? 0, { timeout: 15_000 }).toBe(1);

    // --- Éditeur : accusé « Vu par 1 » et réponse reçue en temps réel -------
    await expect(e.locator("p").filter({ hasText: "Oui, partant !" })).toBeVisible({ timeout: 20_000 });
    await expect(e.getByRole("button", { name: /Vu par 1/ })).toBeVisible({ timeout: 30_000 });

    // --- RLS ---------------------------------------------------------------------
    const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    // Agent non invité : aucune conversation, aucun message
    const asOutsider = anon();
    await asOutsider.auth.signInWithPassword({ email: outsider.email, password: outsider.password });
    expect((await asOutsider.from("channels").select("id")).data).toEqual([]);
    expect((await asOutsider.from("channel_messages").select("id").eq("channel_id", channelId)).data).toEqual([]);
    expect((await asOutsider.rpc("can_use_messaging")).data).toBe(false);
    // Référent : accès au général, mais création de groupe refusée
    const asReferent = anon();
    await asReferent.auth.signInWithPassword({ email: referent.email, password: referent.password });
    if (center) expect(((await asReferent.from("channels").select("type")).data ?? []).some((c) => c.type === "general")).toBe(true);
    const { error: createErr } = await asReferent.from("channels").insert({ type: "group", name: "Interdit", subject: "x", created_by: referent.id });
    expect(createErr).not.toBeNull();
    // Membre invité : ne peut pas ajouter quelqu'un ni retirer un membre
    const asGuest = anon();
    await asGuest.auth.signInWithPassword({ email: guest.email, password: guest.password });
    const { error: addErr } = await asGuest.from("channel_members").insert({ channel_id: channelId, profile_id: outsider.id, added_by: guest.id });
    expect(addErr).not.toBeNull();
    const { data: afterDelete } = await asGuest.from("channel_members").delete().eq("channel_id", channelId).eq("profile_id", editor.id).select("profile_id");
    expect(afterDelete ?? []).toEqual([]);
    // Export réservé aux éditeurs
    expect((await asGuest.rpc("export_channel", { p_channel: channelId })).data).toBeNull();
  } finally {
    if (channelId) await admin.from("channels").delete().eq("id", channelId);
    await admin.from("notifications").delete().in("user_id", [editor.id, guest.id, outsider.id, referent.id]);
    const { data: queue } = await admin.from("notification_queue").select("id, dedupe_key").like("dedupe_key", `msg:${channelId ?? "none"}%`);
    if (queue?.length) await admin.from("notification_queue").delete().in("id", queue.map((q) => q.id));
    if (center) await admin.from("center_referents").delete().eq("profile_id", referent.id);
    for (const u of [editor, guest, outsider, referent]) await admin.auth.admin.deleteUser(u.id);
  }
});
