import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/** Chemin du binaire ffmpeg (ffmpeg-static : linux x64 sur Vercel, win32 en local). */
export function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- module CommonJS exportant un chemin
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new Error("ffmpeg indisponible sur cette plateforme");
  return p;
}

export async function runFfmpeg(args: string[], { timeoutMs = 280_000, cwd }: { timeoutMs?: number; cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"], cwd });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg : délai dépassé"));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg (code ${code}) : ${stderr.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400)}`));
    });
  });
}

/** Durée, dimensions et rotation lues dans la sortie de `ffmpeg -i`. */
export async function probe(file: string): Promise<{ duration: number; width: number; height: number }> {
  let out = "";
  try {
    await runFfmpeg(["-i", file, "-f", "null", "-t", "0.1", "-"], { timeoutMs: 60_000 });
  } catch (e) {
    out = e instanceof Error ? e.message : "";
  }
  // La commande ci-dessus réussit : on relit la sortie via une seconde passe silencieuse
  const info = await new Promise<string>((resolve) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let s = "";
    child.stderr.on("data", (d) => (s += String(d)));
    child.on("close", () => resolve(s));
    child.on("error", () => resolve(s));
  });
  const text = info || out;
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const v = /Video:.*?\s(\d{2,5})x(\d{2,5})/.exec(text);
  let width = v ? Number(v[1]) : 0;
  let height = v ? Number(v[2]) : 0;
  const rot = /rotation of (-?\d+)/.exec(text) ?? /rotate\s*:\s*(-?\d+)/.exec(text);
  if (rot && Math.abs(Number(rot[1])) % 180 === 90) [width, height] = [height, width];
  return { duration, width, height };
}

export async function tmpDir(prefix = "atlas-video-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function rmDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
