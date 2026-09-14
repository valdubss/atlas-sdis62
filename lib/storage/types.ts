/**
 * Abstraction du stockage de fichiers.
 *
 * Deux pilotes :
 *  - "s3"       : bucket S3 compatible (Scaleway, Cloudflare R2, endpoint S3 de
 *                 Supabase Storage…) via le SDK AWS v3 — cible de production ;
 *  - "supabase" : API Supabase Storage (bucket public « media »), utilisée
 *                 automatiquement tant que les variables S3_* ne sont pas renseignées.
 *
 * Dans les deux cas, l'upload part directement du navigateur vers le stockage
 * (URL signée), jamais via le serveur Next.
 */
export type PresignedUpload = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
};

export interface StorageDriver {
  readonly name: "s3" | "supabase";
  presignUpload(key: string, mime: string, sizeBytes: number): Promise<PresignedUpload>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, mime: string): Promise<void>;
  deleteObjects(keys: string[]): Promise<void>;
  publicUrl(key: string): string;
}
