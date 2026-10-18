import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { adminClient, loadEnv, magicLink } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);
const ADMIN_EMAIL = env.E2E_ADMIN_EMAIL ?? (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();

/** Photo de test 640×360 (dégradé) générée par sharp. */
async function samplePhoto(): Promise<string> {
  const out = path.join(os.tmpdir(), "atlas-e2e-sample.png");
  if (fs.existsSync(out)) return out;
  const sharp = (await import("sharp")).default;
  const width = 640;
  const height = 360;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set([Math.round((x / width) * 255), Math.round((y / height) * 255), 120], (y * width + x) * 3);
  await sharp(raw, { raw: { width, height, channels: 3 } }).png().toFile(out);
  return out;
}

/**
 * Publication d'une photo : envoi, variantes produites par la route interne de traitement
 * d'image (/api/media/variants, appelée par HTTP avec CRON_SECRET — un proxy qui la renverrait
 * vers /login casserait tous les envois de photos), publication, image affichée dans le fil.
 */
test("photo : envoi, variantes, publication, affichage dans le fil", async ({ browser, baseURL }) => {
  test.skip(!ADMIN_EMAIL, "E2E_ADMIN_EMAIL ou ALLOWED_EMAILS requis");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const page = await (await browser.newContext()).newPage();
  await page.goto(await magicLink(env, baseURL!, ADMIN_EMAIL!), { waitUntil: "networkidle" });

  let postId: string | null = null;
  try {
    await page.goto("/studio/posts/new?type=photo", { waitUntil: "networkidle" });
    await page.getByLabel("Titre").first().fill(`Photo test ${stamp}`);
    await page.locator("input[type=file]").first().setInputFiles(await samplePhoto());
    await expect(page.getByText(/Traitement impossible|Stockage indisponible/)).toHaveCount(0);
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 45_000 });
    await expect(page.getByRole("status").filter({ hasText: /Publication en ligne|en attente/ })).toBeVisible({ timeout: 10_000 });
    postId = (await admin.from("posts").select("id").eq("title", `Photo test ${stamp}`).single()).data!.id;

    // Média prêt avec ses quatre variantes (la publication différée le rend prêt quelques secondes plus tard)
    await expect
      .poll(async () => {
        const { data: pm } = await admin.from("post_media").select("media:media(status, variants, width, height)").eq("post_id", postId!).limit(1).maybeSingle();
        const m = pm?.media as unknown as { status: string; variants: Record<string, string> | null; width: number | null } | null;
        return m?.status === "ready" && Boolean(m.variants?.thumb && m.variants?.full) && m.width === 640;
      }, { timeout: 60_000 })
      .toBe(true);

    await page.goto("/", { waitUntil: "networkidle" });
    const card = page.locator("article", { hasText: `Photo test ${stamp}` });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator("img").first()).toBeVisible();
  } finally {
    if (postId) {
      const { data: pm } = await admin.from("post_media").select("media_id").eq("post_id", postId);
      await admin.from("posts").delete().eq("id", postId);
      for (const m of pm ?? []) await admin.from("media").delete().eq("id", m.media_id);
    }
    await admin.from("notifications").delete().ilike("body", `%${stamp}%`);
  }
});
