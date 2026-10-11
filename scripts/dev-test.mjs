// Serveur de développement branché sur le projet Supabase de TEST (.env.test.local),
// port 3100, sans toucher à .env.local ni au serveur de dev habituel.
//   npm run dev:test        → http://localhost:3100
// Les variables de .env.test.local priment sur celles de .env.local (Next ne remplace
// jamais une variable déjà présente dans l'environnement du processus).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const file = process.env.TEST_ENV_FILE ?? ".env.test.local";
if (!existsSync(file)) {
  console.error(`${file} introuvable : copiez les clés du projet atlas-test (voir README § 12).`);
  process.exit(1);
}
const env = { ...process.env };
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
}
for (const k of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[k]) {
    console.error(`${k} est vide dans ${file} : le serveur de test tournerait sur la production. Arrêt.`);
    process.exit(1);
  }
}
if (!/zrwaybfwteagfpaxkqzr/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ne pointe pas sur le projet atlas-test. Arrêt.");
  process.exit(1);
}
const port = env.PORT ?? "3100";
const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "--turbopack", "-p", port], { stdio: "inherit", env: { ...env, PORT: port }, shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
