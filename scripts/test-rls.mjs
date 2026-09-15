#!/usr/bin/env node
/**
 * Test des règles RLS du réseau de référents (lot A).
 *
 *   npm run test:rls            # crée les comptes/centres de test, vérifie, nettoie
 *   npm run test:rls -- --keep  # garde les données de test pour inspection
 *
 * Nécessite .env.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY). Quatre comptes @sdis62.fr sont créés avec un mot
 * de passe aléatoire : référent A (centre A), référent B (centre B), agent
 * lecteur, éditeur. Chaque cas attendu en échec doit échouer, sinon le script
 * sort en erreur (code 1).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const keep = process.argv.includes("--keep");
const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now().toString(36);
const password = crypto.randomBytes(18).toString("base64url");
const accounts = {
  referentA: `rls-referent-a-${stamp}@sdis62.fr`,
  referentB: `rls-referent-b-${stamp}@sdis62.fr`,
  reader: `rls-agent-${stamp}@sdis62.fr`,
  editor: `rls-editeur-${stamp}@sdis62.fr`,
};
const state = { users: {}, centers: {}, posts: [] };
let failures = 0;
let passes = 0;

try {
  await setup();
  await run();
} finally {
  if (!keep) await cleanup();
  else console.log("Données de test conservées (--keep).");
}
console.log(`\n${passes} réussite(s), ${failures} échec(s).`);
process.exit(failures ? 1 : 0);

// --- scénario ----------------------------------------------------------------
async function run() {
  const refA = await login(accounts.referentA);
  const refB = await login(accounts.referentB);
  const reader = await login(accounts.reader);
  const editor = await login(accounts.editor);
  const A = state.centers.a;
  const B = state.centers.b;

  // Rôles synchronisés par trigger
  const { data: pa } = await admin.from("profiles").select("role").eq("id", state.users.referentA).single();
  check("désignation → rôle referent", pa?.role === "referent");

  // Référent A : proposition en attente sur son centre
  const okInsert = await refA.from("posts").insert({ type: "text", body: "Proposition test A", scope: "center", center_id: A, status: "pending" }).select("id, status, submitted_by, author_display").single();
  check("référent A : proposition pending sur centre A acceptée", !okInsert.error && okInsert.data?.status === "pending", okInsert.error?.message);
  if (okInsert.data) state.posts.push(okInsert.data.id);
  check("référent A : submitted_by = lui-même, auteur affiché « agent »", okInsert.data?.submitted_by === state.users.referentA && okInsert.data?.author_display === "agent");

  // Cas interdits
  await expectFail(refA.from("posts").insert({ type: "text", body: "x", scope: "center", center_id: A, status: "published" }), "référent A : publication directe refusée");
  await expectFail(refA.from("posts").insert({ type: "text", body: "x", scope: "center", center_id: B, status: "pending" }), "référent A : proposition sur centre B refusée");
  await expectFail(refA.from("posts").insert({ type: "text", body: "x", scope: "departmental", status: "pending" }), "référent A : post départemental refusé");
  await expectFail(refA.from("posts").insert({ type: "article", title: "x", body: "x", scope: "center", center_id: A, status: "pending" }), "référent A : type article refusé (photo, texte, vidéo seulement)");
  await expectFail(reader.from("posts").insert({ type: "text", body: "x", scope: "center", center_id: A, status: "pending" }), "agent lecteur : proposition refusée");
  await expectFail(refA.from("centers").update({ name: "Piraté" }).eq("id", A).select("id").single(), "référent A : modification du nom du centre refusée");
  await expectFail(refA.from("center_referents").insert({ center_id: B, profile_id: state.users.referentA }).select("id").single(), "référent A : auto-désignation refusée");

  // Référent A peut proposer une mise à jour de présentation
  const upd = await refA.from("centers").update({ pending_presentation: "Nouvelle présentation proposée" }).eq("id", A).select("pending_presentation, pending_by").single();
  check("référent A : proposition de présentation acceptée", !upd.error && upd.data?.pending_by === state.users.referentA, upd.error?.message);

  // Lecture : la proposition en attente n'est visible que de l'auteur et des éditeurs
  const pid = okInsert.data?.id;
  if (pid) {
    const { data: seenB } = await refB.from("posts").select("id").eq("id", pid);
    check("référent B : ne voit pas la proposition de A", (seenB ?? []).length === 0);
    const { data: seenReader } = await reader.from("posts").select("id").eq("id", pid);
    check("agent lecteur : ne voit pas la proposition", (seenReader ?? []).length === 0);
    const { data: seenA } = await refA.from("posts").select("id").eq("id", pid);
    check("référent A : voit sa proposition", (seenA ?? []).length === 1);
    const { data: seenEditor } = await editor.from("posts").select("id, status").eq("id", pid);
    check("éditeur : voit la proposition", (seenEditor ?? []).length === 1);

    // Fil départemental : jamais de contenu de centre
    const { data: feed } = await reader.rpc("get_feed", { p_limit: 50 });
    const inFeed = JSON.stringify(feed ?? []).includes(pid);
    check("fil : la proposition n'apparaît pas", !inFeed);

    // Validation par l'éditeur
    const pub = await editor.from("posts").update({ status: "published" }).eq("id", pid).select("status, reviewed_by, published_at").single();
    check("éditeur : validation → published avec traçabilité", !pub.error && pub.data?.reviewed_by === state.users.editor && !!pub.data?.published_at, pub.error?.message);
    const { data: seenB2 } = await refB.from("posts").select("id").eq("id", pid);
    check("référent B : voit le post une fois publié (page du centre)", (seenB2 ?? []).length === 1);
    const { data: feed2 } = await reader.rpc("get_feed", { p_limit: 50 });
    check("fil : le post de centre publié n'apparaît toujours pas", !JSON.stringify(feed2 ?? []).includes(pid));
    await expectFail(refA.from("posts").update({ body: "modif après publication" }).eq("id", pid).select("id").single(), "référent A : modification après publication refusée");

    // Promotion au fil par l'éditeur : crée un post départemental distinct
    const promo = await editor.rpc("promote_center_post", { p_post_id: pid });
    check("éditeur : promotion au fil", !promo.error && typeof promo.data === "string", promo.error?.message);
    if (typeof promo.data === "string") {
      state.posts.push(promo.data);
      const { data: p2 } = await admin.from("posts").select("scope, promoted_from_id, tags, location").eq("id", promo.data).single();
      check("promotion : post départemental crédité « Vie des centres »", p2?.scope === "departmental" && p2?.promoted_from_id === pid && (p2?.location ?? "").startsWith("Vie des centres"));
      await scrubNotifications(); // la promotion est une vraie publication : on retire ses push/notifications de test
      const again = await editor.rpc("promote_center_post", { p_post_id: pid });
      check("promotion : refusée une seconde fois", !!again.error);
    }
    await expectFail(refA.rpc("promote_center_post", { p_post_id: pid }), "référent A : promotion au fil refusée");
  }

  // Événements
  const ev = await refA.from("events").insert({ title: "Portes ouvertes test", starts_at: new Date(Date.now() + 864e5).toISOString(), center_id: A, status: "pending" }).select("id").single();
  check("référent A : événement de centre proposé", !ev.error, ev.error?.message);
  await expectFail(refA.from("events").insert({ title: "x", starts_at: new Date().toISOString(), center_id: A, status: "published" }), "référent A : événement publié directement refusé");
  await expectFail(refA.from("events").insert({ title: "x", starts_at: new Date().toISOString(), status: "pending" }), "référent A : événement départemental refusé");
  if (ev.data) {
    const { data: seenB } = await refB.from("events").select("id").eq("id", ev.data.id);
    check("référent B : ne voit pas l'événement en attente", (seenB ?? []).length === 0);
  }

  // Retrait du référent → retour au rôle lecteur
  await admin.from("center_referents").update({ is_active: false, ended_at: new Date().toISOString() }).eq("profile_id", state.users.referentA);
  const { data: pa2 } = await admin.from("profiles").select("role").eq("id", state.users.referentA).single();
  check("retrait → rôle reader", pa2?.role === "reader");
  const refA2 = await login(accounts.referentA);
  await expectFail(refA2.from("posts").insert({ type: "text", body: "x", scope: "center", center_id: A, status: "pending" }), "ancien référent : proposition refusée");
}

// --- outillage ---------------------------------------------------------------
async function setup() {
  for (const [key, email] of Object.entries(accounts)) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: "Test", last_name: key } });
    if (error) fail(new Error(`création ${email} : ${error.message}`));
    state.users[key] = data.user.id;
  }
  const { error: roleErr } = await admin.from("profiles").update({ role: "editor" }).eq("id", state.users.editor);
  if (roleErr) fail(roleErr);
  for (const k of ["a", "b"]) {
    const { data, error } = await admin.from("centers").insert({ slug: `rls-test-${k}-${stamp}`, name: `Centre test ${k.toUpperCase()} ${stamp}`, type: "cis", city: "Test" }).select("id").single();
    if (error) fail(error);
    state.centers[k] = data.id;
  }
  const { error: r1 } = await admin.from("center_referents").insert([
    { center_id: state.centers.a, profile_id: state.users.referentA },
    { center_id: state.centers.b, profile_id: state.users.referentB },
  ]);
  if (r1) fail(r1);
  console.log("Comptes et centres de test créés.");
}

/** Retire les push en file et les notifications générées par les posts de test (avant leur suppression). */
async function scrubNotifications() {
  if (!state.posts.length) return;
  const { data: rows } = await admin.from("posts").select("id, slug").in("id", state.posts);
  const { data: queue } = await admin.from("notification_queue").select("id, payload").in("status", ["pending", "processing"]).limit(500);
  const ids = (queue ?? []).filter((q) => state.posts.includes(q.payload?.post_id)).map((q) => q.id);
  if (ids.length) await admin.from("notification_queue").delete().in("id", ids);
  const urls = (rows ?? []).map((r) => `/post/${r.slug}`);
  if (urls.length) await admin.from("notifications").delete().in("url", urls);
}

async function cleanup() {
  const ids = Object.values(state.users);
  await scrubNotifications();
  if (state.posts.length) await admin.from("posts").delete().in("id", state.posts);
  if (ids.length) {
    await admin.from("posts").delete().in("author_id", ids);
    await admin.from("events").delete().in("author_id", ids);
    await admin.from("center_referents").delete().in("profile_id", ids);
  }
  const centers = Object.values(state.centers);
  if (centers.length) await admin.from("centers").delete().in("id", centers);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
  console.log("Données de test supprimées.");
}

async function login(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) fail(new Error(`connexion ${email} : ${error.message}`));
  return client;
}

async function expectFail(promise, label) {
  const res = await promise;
  const failed = !!res.error || (Array.isArray(res.data) ? res.data.length === 0 : res.data == null);
  check(label, failed, failed ? undefined : "l'opération a été acceptée");
}

function check(label, ok, detail) {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`${ok ? "✔" : "✘"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) fail(new Error(".env.local introuvable"));
  const env = Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
  );
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) if (!env[k]) fail(new Error(`${k} requis dans .env.local`));
  return env;
}

function fail(e) {
  console.error(e.message ?? e);
  process.exit(1);
}
