import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignedUpload, StorageDriver } from "./types";

let client: S3Client | null = null;

function s3() {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      // Scaleway et R2 fonctionnent en style virtual-host ; l'endpoint S3 de
      // Supabase Storage exige le style "path".
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  }
  return client;
}

const bucket = () => process.env.S3_BUCKET!;

/** Pilote S3 compatible (Scaleway Object Storage, Cloudflare R2, …). */
export const s3Storage: StorageDriver = {
  name: "s3",

  async presignUpload(key, mime): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime }),
      { expiresIn: 15 * 60 },
    );
    return { url, method: "PUT", headers: { "Content-Type": mime } };
  },

  async getObject(key) {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  },

  async putObject(key, body, mime) {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: body,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  },

  async deleteObjects(keys) {
    if (keys.length === 0) return;
    await s3().send(
      new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })) } }),
    );
  },

  publicUrl(key) {
    return `${(process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}`;
  },
};
