import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/** WebP 1×1 valide (lossless), suffisant pour une variante d'image. */
const WEBP_1PX = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

/**
 * Zoom pincé sur une photo du fil : à deux doigts, une copie de la photo se détache au-dessus
 * de la page et suit l'écartement ; au relâchement elle disparaît, et la publication n'est pas
 * ouverte. Touches synthétisées (Chrome).
 */
test("fil : pincement sur une photo = zoom sur place, sans ouvrir la publication", async ({ browser }) => {
  test.setTimeout(120_000);
  const editor = await createTestUser(admin, "ed");
  await admin.from("profiles").update({ role: "editor" }).eq("id", editor.id);
  const stamp = editor.stamp;
  const mediaId = crypto.randomUUID();
  const key = `variants/${mediaId}/medium.webp`;
  await admin.storage.from("media").upload(key, WEBP_1PX, { contentType: "image/webp", upsert: true });
  await admin.from("media").insert({ id: mediaId, owner_id: editor.id, kind: "image", status: "ready", mime: "image/webp", size_bytes: WEBP_1PX.length, original_key: `originals/${mediaId}.webp`, variants: { thumb: key, small: key, medium: key, full: key }, width: 1200, height: 900 });
  const { data: post } = await admin.from("posts").insert({ type: "photo", title: `Pince ${stamp}`, status: "published", published_at: new Date().toISOString(), author_id: editor.id, author_display: "service_com" }).select("id").single();
  await admin.from("post_media").insert({ post_id: post!.id, media_id: mediaId, position: 0 });
  const page = await (await browser.newContext({ hasTouch: true })).newPage();
  try {
    await loginWithPassword(page, editor.email, editor.password);
    await page.goto("/", { waitUntil: "networkidle" });
    const card = page.locator("article", { hasText: `Pince ${stamp}` });
    const img = card.locator("img").first();
    await expect(img).toBeVisible();
    const result = await img.evaluate(async (el) => {
      const r = el.getBoundingClientRect();
      const mk = (id: number, x: number, y: number) => new Touch({ identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const fire = (type: string, touches: Touch[]) => el.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: touches, bubbles: true, cancelable: true }));
      fire("touchstart", [mk(1, cx - 20, cy), mk(2, cx + 20, cy)]);
      fire("touchmove", [mk(1, cx - 60, cy), mk(2, cx + 60, cy)]);
      await new Promise((res) => setTimeout(res, 50));
      const overlay = document.querySelector('div[aria-hidden="true"][style*="z-index:80"], div[aria-hidden="true"][style*="z-index: 80"]');
      const clone = overlay?.querySelector("img");
      const during = { overlay: Boolean(overlay), transform: clone ? getComputedStyle(clone).transform : null, hidden: getComputedStyle(el).visibility };
      fire("touchend", []);
      await new Promise((res) => setTimeout(res, 300));
      const after = { overlay: Boolean(document.querySelector('div[aria-hidden="true"][style*="z-index"] img')), hidden: getComputedStyle(el).visibility };
      return { during, after };
    });
    expect(result.during.overlay).toBe(true);
    expect(result.during.hidden).toBe("hidden");
    expect(result.during.transform).not.toBe("none");
    expect(result.after.overlay).toBe(false);
    expect(result.after.hidden).toBe("visible");
    // La publication ne s'est pas ouverte en exergue
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    if (post) await admin.from("posts").delete().eq("id", post.id);
    await admin.from("media").delete().eq("id", mediaId);
    await admin.storage.from("media").remove([key]);
    await admin.auth.admin.deleteUser(editor.id);
  }
});
