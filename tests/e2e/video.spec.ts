import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { adminClient, loadEnv, magicLink } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);
const ADMIN_EMAIL = env.E2E_ADMIN_EMAIL ?? (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();

/** Vidéo de test (6 s, 640×360, mire + son) générée par ffmpeg-static. */
function sampleVideo(): string {
  const out = path.join(os.tmpdir(), "atlas-e2e-sample.mp4");
  if (fs.existsSync(out)) return out;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpeg = require("ffmpeg-static") as string;
  const r = spawnSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=duration=6:size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out], { stdio: "ignore" });
  if (r.status !== 0) throw new Error("ffmpeg indisponible pour générer la vidéo de test");
  return out;
}

/**
 * Publication d'une vidéo avec sous-titres importés : transcodage HLS déclenché,
 * poster extrait, lecture muette avec sous-titres dans le fil, paliers enregistrés.
 */
test("vidéo : publication, HLS, sous-titres, paliers de lecture", async ({ browser, baseURL }) => {
  test.skip(!ADMIN_EMAIL, "E2E_ADMIN_EMAIL ou ALLOWED_EMAILS requis");
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(await magicLink(env, baseURL!, ADMIN_EMAIL!), { waitUntil: "networkidle" });

  let postId: string | null = null;
  try {
    await page.goto("/studio/posts/new?type=video", { waitUntil: "networkidle" });
    await page.getByLabel("Titre").first().fill(`Vidéo test ${stamp}`);
    await page.locator("input[type=file]").first().setInputFiles(sampleVideo());
    // Compression sur l'appareil puis envoi ; le panneau vidéo apparaît quand le média est prêt
    await expect(page.getByText("Vidéo", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Importer \.vtt/ })).toBeVisible({ timeout: 120_000 });

    // Sous-titres importés puis publiés
    const vtt = path.join(os.tmpdir(), `atlas-${stamp}.vtt`);
    fs.writeFileSync(vtt, "WEBVTT\n\n00:00:00.500 --> 00:00:03.000\nBonjour à tous\n\n00:00:03.000 --> 00:00:05.500\nManœuvre du samedi\n");
    await page.locator("input[type=file][accept*='.vtt']").setInputFiles(vtt);
    await expect(page.getByLabel("Ligne 1")).toHaveValue("Bonjour à tous", { timeout: 15_000 });
    await page.getByRole("button", { name: "Publier les sous-titres" }).click();
    await expect(page.getByText("Publiés", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Transcodage : prêt (HLS) dans les 2 minutes
    await expect(page.getByText("Prête", { exact: true })).toBeVisible({ timeout: 150_000 });

    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await page.waitForURL(/\/studio\/posts\/[0-9a-f-]{36}\?ok=published/, { timeout: 30_000 });
    postId = new URL(page.url()).pathname.split("/").pop()!;

    const { data: media } = await admin.from("media").select("video_status, hls_key, poster_key, renditions, orientation").eq("kind", "video").order("created_at", { ascending: false }).limit(1).single();
    expect(media?.video_status).toBe("ready");
    expect(media?.hls_key).toMatch(/master\.m3u8$/);
    expect(media?.poster_key).toBeTruthy();
    expect(media?.orientation).toBe("landscape");
    expect((media?.renditions as { height: number }[]).length).toBeGreaterThanOrEqual(1);

    // Fil : lecture muette, piste de sous-titres présente, palier 25 % enregistré
    await page.goto("/", { waitUntil: "networkidle" });
    const card = page.locator("article", { hasText: `Vidéo test ${stamp}` });
    await expect(card).toBeVisible();
    const video = card.locator("video");
    await expect(video).toHaveAttribute("aria-label", /Vidéo/);
    await expect(card.locator("track")).toHaveCount(1);
    await expect(card.getByRole("button", { name: "Activer le son" })).toBeVisible();
    await video.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      return v.play().catch(() => {});
    });
    // Lecture HLS via MediaSource (hls.js) : la source courante est un blob:
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentSrc.startsWith("blob:") && !v.paused), { timeout: 15_000 }).toBe(true);
    await expect
      .poll(async () => (await admin.from("post_views").select("progress").eq("post_id", postId!).maybeSingle()).data?.progress ?? 0, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(25);
  } finally {
    if (postId) {
      const { data: pm } = await admin.from("post_media").select("media_id").eq("post_id", postId);
      await admin.from("posts").delete().eq("id", postId);
      for (const m of pm ?? []) await admin.from("media").delete().eq("id", m.media_id);
    }
    await admin.from("notifications").delete().ilike("body", `%${stamp}%`);
    const { data: queue } = await admin.from("notification_queue").select("id, payload").in("status", ["pending", "processing"]);
    const ids = (queue ?? []).filter((q) => JSON.stringify(q.payload).includes(stamp)).map((q) => q.id);
    if (ids.length) await admin.from("notification_queue").delete().in("id", ids);
  }
});
