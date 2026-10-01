import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ObjectTooLargeError, type ObjectStorage } from './object-storage';

export interface S3StorageConfig {
  endpoint: string;
  /** Host that devices use; presigned URLs are signed for it (see config/env.ts). */
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** S3 "not found" comes back as NotFound (HEAD) or NoSuchKey (GET), always with status 404. */
function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/**
 * ObjectStorage over the S3 API — MinIO in development, Cloudflare R2 in production.
 *
 * Two clients: the server talks to `endpoint` (e.g. the Docker network), while URLs handed to
 * phones are signed with `publicEndpoint`, because the host is part of an S3 signature.
 */
export function createS3Storage(config: S3StorageConfig): ObjectStorage {
  const base: S3ClientConfig = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Newer SDKs add CRC32 checksums to every upload by default. For presigned PUTs that would
    // require the phone to send a matching checksum header, and R2/MinIO do not need them.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
  const client = new S3Client({
    ...base,
    endpoint: config.endpoint,
    // Fail fast like the database pool; services add their own overall timeout on top.
    requestHandler: { connectionTimeout: 3000, requestTimeout: 8000 },
    maxAttempts: 2,
  });
  const publicClient = new S3Client({ ...base, endpoint: config.publicEndpoint });
  const Bucket = config.bucket;

  return {
    async createUploadUrl(key, { contentType, byteSize }, expiresInSeconds) {
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: byteSize });
      // Content-Type and Content-Length are signed: the upload must be exactly the declared size
      // and type, so a client cannot swap in a larger file after asking for the URL.
      const url = await getSignedUrl(publicClient, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type', 'content-length']),
      });
      return { url, headers: { 'Content-Type': contentType }, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    },

    createDownloadUrl(key, expiresInSeconds) {
      return getSignedUrl(publicClient, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: expiresInSeconds });
    },

    async stat(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { byteSize: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async read(key, maxBytes) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        // Checked again here (not only in stat): the object could have been replaced in between.
        if ((object.ContentLength ?? 0) > maxBytes) {
          await object.Body?.transformToWebStream().cancel();
          throw new ObjectTooLargeError(key, object.ContentLength ?? 0);
        }
        const bytes = await object.Body?.transformToByteArray();
        return bytes ? Buffer.from(bytes) : Buffer.alloc(0);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async write(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // Keys contain the photo id and are never overwritten, so clients may cache forever.
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      );
    },

    async remove(keys) {
      if (keys.length === 0) return;
      // DeleteObjects takes up to 1000 keys per call; S3 does not report missing keys as errors.
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
      }
    },

    async removePrefix(prefix) {
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
        await this.remove((page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : [])));
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
    },
  };
}
