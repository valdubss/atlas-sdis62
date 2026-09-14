import "server-only";

import type { StorageDriver } from "./types";
import { s3Storage } from "./s3";
import { supabaseStorage } from "./supabase";

/**
 * Sélection du pilote :
 *  - STORAGE_DRIVER=s3|supabase force un pilote ;
 *  - sinon S3 si S3_ENDPOINT + S3_BUCKET + clés sont renseignés, Supabase Storage à défaut.
 */
export function getStorage(): StorageDriver {
  const forced = process.env.STORAGE_DRIVER;
  if (forced === "s3") return s3Storage;
  if (forced === "supabase") return supabaseStorage;
  const s3Ready = Boolean(
    process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY,
  );
  return s3Ready ? s3Storage : supabaseStorage;
}

export type { StorageDriver, PresignedUpload } from "./types";
