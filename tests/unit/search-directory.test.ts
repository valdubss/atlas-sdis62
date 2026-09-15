import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Recherche de l'annuaire (fonction SQL search_directory), tolérante aux fautes.
 * S'exécute contre la base liée dans .env.local ; ignoré si absent.
 */
function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return null;
  const env = Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  return env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? env : null;
}

const env = loadEnv();
const maybe = env ? describe : describe.skip;

maybe("search_directory", () => {
  const admin = createClient(env!.NEXT_PUBLIC_SUPABASE_URL, env!.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const stamp = Date.now().toString(36);
  const name = `CIS Wimereux ${stamp}`;

  it("trouve un centre par nom exact, par ville et malgré une faute", async () => {
    const { data: c, error } = await admin.from("centers").insert({ slug: `vitest-${stamp}`, name, type: "cis", city: "Wimereux" }).select("id").single();
    expect(error).toBeNull();
    try {
      for (const q of ["wimereux", "Wimereu", "wimerux", "WIMEREUX"]) {
        const { data } = await admin.rpc("search_directory", { p_q: q });
        const centers = (data as { centers: { id: string }[] }).centers;
        expect(centers.some((x) => x.id === c!.id), `requête « ${q} »`).toBe(true);
      }
      const { data: none } = await admin.rpc("search_directory", { p_q: "zzzzqqq" });
      expect((none as { centers: unknown[] }).centers).toHaveLength(0);
      const { data: short } = await admin.rpc("search_directory", { p_q: "a" });
      expect((short as { centers: unknown[] }).centers).toHaveLength(0);
    } finally {
      await admin.from("centers").delete().eq("id", c!.id);
    }
  });

  it("ne renvoie que les agents visibles dans l'annuaire", async () => {
    const { data } = await admin.rpc("search_directory", { p_q: "dubois" });
    const people = (data as { people: { id: string }[] }).people;
    const { data: hidden } = await admin.from("profiles").select("id").eq("directory_visible", false).ilike("last_name", "%dubois%");
    for (const h of hidden ?? []) expect(people.some((p) => p.id === h.id)).toBe(false);
  });
});
