/**
 * Object storage as the rest of the API sees it. Services depend on this interface only, so unit
 * tests use a mock and the S3 implementation (s3-storage.ts) can target MinIO or Cloudflare R2.
 *
 * Why it lives next to db/ and not in modules/: like the database pool it is infrastructure
 * shared by several modules (photos, dogs; later park reports and health documents).
 */

export interface PresignedUpload {
  url: string;
  /** Headers the client must send unchanged; they are part of the signature. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObjectInfo {
  byteSize: number;
  contentType: string | null;
}

export interface ObjectStorage {
  /** Signed PUT for exactly this content type and byte size; the client uploads directly. */
  createUploadUrl(key: string, file: { contentType: string; byteSize: number }, expiresInSeconds: number): Promise<PresignedUpload>;
  /** Signed GET — the bucket is private, this is the only way a client can read an object. */
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** null when the object does not exist. */
  stat(key: string): Promise<StoredObjectInfo | null>;
  /** null when the object does not exist; throws ObjectTooLargeError above `maxBytes`. */
  read(key: string, maxBytes: number): Promise<Buffer | null>;
  write(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Deleting a missing key is not an error. */
  remove(keys: string[]): Promise<void>;
  /** Deletes every object whose key starts with `prefix` (e.g. all photos of a dog). */
  removePrefix(prefix: string): Promise<void>;
}

export class ObjectTooLargeError extends Error {
  constructor(
    readonly key: string,
    readonly byteSize: number,
  ) {
    super(`Object ${key} is ${byteSize} bytes`);
    this.name = 'ObjectTooLargeError';
  }
}
