import "server-only";

import type { PresignedUpload, StorageDriver } from "./types";

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "media";

function base() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "") + "/storage/v1";
}

function authHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante (pilote de stockage Supabase)");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/** Pilote Supabase Storage (bucket public). Aucune configuration S3 nécessaire. */
export const supabaseStorage: StorageDriver = {
  name: "supabase",

  async presignUpload(key, mime): Promise<PresignedUpload> {
    const res = await fetch(`${base()}/object/upload/sign/${BUCKET}/${key}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`Signature d'upload refusée (${res.status}) : ${await res.text()}`);
    const data = (await res.json()) as { url: string; token?: string };
    // data.url = "/object/upload/sign/<bucket>/<key>?token=…"
    return {
      url: `${base()}${data.url.startsWith("/") ? data.url : "/" + data.url}`,
      method: "PUT",
      headers: { "Content-Type": mime, "x-upsert": "true" },
    };
  },

  async getObject(key) {
    const res = await fetch(`${base()}/object/${BUCKET}/${key}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Lecture impossible (${res.status}) : ${key}`);
    return Buffer.from(await res.arrayBuffer());
  },

  async putObject(key, body, mime) {
    const res = await fetch(`${base()}/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": mime, "x-upsert": "true", "cache-control": "max-age=31536000, immutable" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Écriture impossible (${res.status}) : ${key} — ${await res.text()}`);
  },

  async deleteObjects(keys) {
    if (keys.length === 0) return;
    const res = await fetch(`${base()}/object/${BUCKET}`, {
      method: "DELETE",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: keys }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Suppression impossible (${res.status})`);
  },

  publicUrl(key) {
    return `${base()}/object/public/${BUCKET}/${key}`;
  },
};
