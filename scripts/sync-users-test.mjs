// Copie les comptes de la production vers le projet de test, à l'identique : auth.users
// (mot de passe chiffré compris), auth.identities, profiles, user_settings. Aucune suppression.
//   npm run comptes:sync-test
// Connexions directes aux deux bases (pooler Supabase, mode session). Variables :
//   .env.local       SUPABASE_DB_PASSWORD        (mot de passe de la base de production)
//   .env.test.local  SUPABASE_TEST_DB_PASSWORD   (mot de passe de la base de test)
// ou, en CI, PROD_DB_PASSWORD / TEST_DB_PASSWORD dans l'environnement.
import pg from "pg";
import fs from "node:fs";

const load = (f) => (fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })) : {});
const prodEnv = load(".env.local");
const testEnv = load(".env.test.local");
// SYNC_SOURCE_REF permet un essai à blanc (source = projet de test lui-même) ; la cible est toujours atlas-test
const PROD_REF = process.env.SYNC_SOURCE_REF ?? "fxtqutqtiqgpttqpnouy";
const TEST_REF = "zrwaybfwteagfpaxkqzr";
const POOLER = "aws-0-eu-west-2.pooler.supabase.com";
const prodPassword = process.env.PROD_DB_PASSWORD ?? prodEnv.SUPABASE_DB_PASSWORD;
const testPassword = process.env.TEST_DB_PASSWORD ?? testEnv.SUPABASE_TEST_DB_PASSWORD;
if (!prodPassword) throw new Error("Mot de passe de la base de production manquant (SUPABASE_DB_PASSWORD dans .env.local, ou PROD_DB_PASSWORD).");
if (!testPassword) throw new Error("Mot de passe de la base de test manquant (SUPABASE_TEST_DB_PASSWORD dans .env.test.local, ou TEST_DB_PASSWORD).");

const connect = async (ref, password) => {
  const c = new pg.Client({ host: POOLER, port: 5432, user: `postgres.${ref}`, database: "postgres", password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  return c;
};
const src = await connect(PROD_REF, prodPassword);
const dst = await connect(TEST_REF, testPassword);

/** Colonnes copiables d'une table (sans colonnes générées). */
async function columns(client, schema, table) {
  const { rows } = await client.query("select column_name from information_schema.columns where table_schema = $1 and table_name = $2 and is_generated = 'NEVER' order by ordinal_position", [schema, table]);
  return rows.map((r) => r.column_name);
}
const q = (s) => `"${s}"`;

/** Copie table par table : lecture en production, upsert sur le test par lots de 200. */
async function mirror(schema, table, { where = "", conflict = "id", skipUpdate = [] } = {}) {
  const srcCols = await columns(src, schema, table);
  const dstCols = new Set(await columns(dst, schema, table));
  const cols = srcCols.filter((c) => dstCols.has(c));
  const { rows } = await src.query(`select ${cols.map(q).join(", ")} from ${q(schema)}.${q(table)} ${where}`);
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const values = [];
    const tuples = batch.map((r, bi) => `(${cols.map((c, ci) => { values.push(r[c]); return `$${bi * cols.length + ci + 1}`; }).join(", ")})`);
    const updates = cols.filter((c) => c !== conflict && !skipUpdate.includes(c)).map((c) => `${q(c)} = excluded.${q(c)}`).join(", ");
    await dst.query(`insert into ${q(schema)}.${q(table)} (${cols.map(q).join(", ")}) values ${tuples.join(", ")} on conflict (${q(conflict)}) do update set ${updates}`, values);
    done += batch.length;
  }
  console.log(`${schema}.${table} : ${done} ligne(s) synchronisée(s)`);
  return done;
}

try {
  await dst.query("begin");
  // Le garde-fou des profils (rôle, activation, e-mail réservés aux administrateurs) ne doit pas
  // bloquer la copie : désactivé le temps de la transaction, comme le rattachement d'office
  await dst.query("alter table public.profiles disable trigger profiles_guard");
  await dst.query("alter table public.profiles disable trigger profiles_contact_attach");
  // Comptes de test (e2e-…, ui-test-…) jamais copiés depuis la production
  const notTest = "where email not like 'e2e-%' and email not like 'ui-test-%' and email not like 'mdp-%' and email not like 'frag-%' and email not like 'csp-%' and email not like 'adm-%' and email not like 'lb-test-%' and email not like 'nav-test-%' and email not like 'map-test-%' and email not like 'rattach-%'";
  // Un compte créé directement sur le projet de test avec la même adresse qu'un compte de
  // production (autre identifiant) ferait échouer la copie (adresse unique) : il est remplacé,
  // ses données de test (profil, réglages, contenus en cascade) disparaissent avec lui.
  const { rows: srcUsers } = await src.query(`select id, lower(email) as email from auth.users ${notTest}`);
  const { rows: dstUsers } = await dst.query("select id, lower(email) as email from auth.users where email is not null");
  const srcById = new Map(srcUsers.map((u) => [u.id, u.email]));
  const srcByEmail = new Map(srcUsers.map((u) => [u.email, u.id]));
  const collisions = dstUsers.filter((u) => srcByEmail.has(u.email) && srcByEmail.get(u.email) !== u.id && !srcById.has(u.id));
  for (const u of collisions) {
    await dst.query("delete from public.profiles where id = $1", [u.id]);
    await dst.query("delete from auth.users where id = $1", [u.id]);
    console.log(`compte de test remplacé par celui de la production : ${u.email}`);
  }
  await mirror("auth", "users", { where: notTest });
  await mirror("auth", "identities", { where: "where user_id in (select id from auth.users " + notTest + ")" });
  await mirror("public", "profiles", { where: notTest });
  await mirror("public", "user_settings", { where: "where user_id in (select id from public.profiles " + notTest + ")", conflict: "user_id" });
  await dst.query("alter table public.profiles enable trigger profiles_guard");
  await dst.query("alter table public.profiles enable trigger profiles_contact_attach");
  await dst.query("commit");
  console.log("Comptes du projet de test alignés sur la production.");
} catch (e) {
  await dst.query("rollback").catch(() => {});
  console.error("Synchronisation interrompue :", e.message);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
