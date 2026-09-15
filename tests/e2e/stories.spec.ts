import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Stories v2 : sondage superposé (vote → répartition), question ouverte,
 * réaction ; les réactions et les réponses ne sont lisibles que du studio (RLS).
 */
test("story : sondage, question, réaction et visibilité réservée à la com", async ({ browser }) => {
  test.setTimeout(180_000);
  const agent = await createTestUser(admin, "story");
  const { stamp } = agent;
  const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim() ?? "").maybeSingle();
  const { data: image } = await admin.from("media").select("id").eq("kind", "image").eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
  test.skip(!image, "Aucune image prête dans la base pour porter une story.");

  const { data: series } = await admin.from("story_series").insert({ title: `Série ${stamp}`, created_by: adminProfile?.id ?? null }).select("id").single();
  const { data: story } = await admin
    .from("stories")
    .insert({ series_id: series!.id, media_id: image!.id, author_id: adminProfile?.id ?? null, overlay: { text: `Story ${stamp}`, x: 0.5, y: 0.3 }, status: "published", display_seconds: 15, published_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() })
    .select("id")
    .single();
  const storyId = story!.id;
  const { data: poll } = await admin.from("story_polls").insert({ story_id: storyId, question: `Prêts ${stamp} ?`, options: ["Oui", "Non"], x: 0.5, y: 0.55 }).select("id").single();
  const { data: question } = await admin.from("story_questions").insert({ story_id: storyId, prompt: `Une idée ${stamp} ?`, x: 0.5, y: 0.74 }).select("id").single();

  try {
    const page = await (await browser.newContext()).newPage();
    await loginWithPassword(page, agent.email, agent.password);
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("listitem", { name: new RegExp(`Série ${stamp}`) }).click();

    const viewer = page.getByRole("dialog", { name: `Stories : Série ${stamp}` });

    // Sondage : vote puis répartition
    const pollBox = viewer.getByRole("group", { name: `Sondage : Prêts ${stamp} ?` });
    await expect(pollBox).toBeVisible({ timeout: 15_000 });
    await pollBox.getByRole("button", { name: "Oui" }).click();
    await expect(pollBox.getByText("100 %")).toBeVisible({ timeout: 15_000 });
    await expect(pollBox.getByText("1 vote")).toBeVisible();

    // Réaction « Au top »
    await viewer.getByRole("button", { name: "Au top" }).click();
    await expect.poll(async () => (await admin.from("story_reactions").select("kind").eq("story_id", storyId).eq("user_id", agent.id).maybeSingle()).data?.kind ?? null, { timeout: 15_000 }).toBe("fire");

    // Question ouverte
    const qBox = viewer.getByRole("group", { name: `Question : Une idée ${stamp} ?` });
    await qBox.getByLabel("Votre réponse").fill("Portes ouvertes en juin");
    await qBox.getByRole("button", { name: "Envoyer" }).click();
    await expect(qBox.getByText("Réponse envoyée")).toBeVisible({ timeout: 15_000 });

    // Fermeture → progression remontée
    await viewer.getByRole("button", { name: "Fermer" }).click();
    await expect.poll(async () => (await admin.from("story_views").select("progress").eq("story_id", storyId).eq("user_id", agent.id).maybeSingle()).data?.progress ?? -1, { timeout: 15_000 }).toBeGreaterThanOrEqual(0);

    // RLS : un agent ne voit que sa propre réaction, jamais les réponses aux questions
    if (adminProfile) await admin.from("story_reactions").insert({ story_id: storyId, user_id: adminProfile.id, kind: "heart" });
    const asAgent = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { error: loginError } = await asAgent.auth.signInWithPassword({ email: agent.email, password: agent.password });
    expect(loginError).toBeNull();
    const { data: reactions } = await asAgent.from("story_reactions").select("user_id").eq("story_id", storyId);
    expect((reactions ?? []).map((r) => r.user_id)).toEqual([agent.id]);
    const { data: answers } = await asAgent.from("story_question_answers").select("id").eq("question_id", question!.id);
    expect(answers ?? []).toHaveLength(0);
    const { data: votes } = await asAgent.from("story_poll_votes").select("user_id").eq("poll_id", poll!.id);
    expect((votes ?? []).map((v) => v.user_id)).toEqual([agent.id]);
    // Alors que la com voit tout
    const { count } = await admin.from("story_question_answers").select("id", { count: "exact", head: true }).eq("question_id", question!.id);
    expect(count).toBe(1);
  } finally {
    await admin.from("stories").delete().eq("id", storyId);
    await admin.from("story_series").delete().eq("id", series!.id);
    await admin.auth.admin.deleteUser(agent.id);
  }
});
