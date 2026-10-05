import { randomUUID } from 'node:crypto';

import type { ImageUrls } from '@kapp/shared';

import { HttpError, ServiceUnavailableError } from '../../http/errors';
import { TimeoutError, withTimeout } from '../../lib/timeout';
import { ObjectTooLargeError, type ObjectStorage } from '../../storage/object-storage';

/**
 * Object keys, signed URLs and storage error handling shared by the photos and dogs services.
 *
 * Key layout (the bucket is private, keys are never shown to other users):
 *   uploads/<userId>/<uuid>                raw upload, deleted after processing
 *   dogs/<dogId>/<photoId>/full.webp       ≤ 1600 px
 *   dogs/<dogId>/<photoId>/thumb.webp      ≤ 400 px
 * Grouping by dog and photo lets one prefix delete remove everything of a photo or a dog.
 */

/** Presigned PUT lifetime — enough for a slow mobile upload, short enough to be useless when leaked. */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
/** Signed GET lifetime; the app refetches lists on focus, so links are renewed long before this. */
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

export const newUploadKey = (userId: string) => `uploads/${userId}/${randomUUID()}`;
export const uploadPrefix = (userId: string) => `uploads/${userId}/`;
export const dogPrefix = (dogId: string) => `dogs/${dogId}/`;
export const photoPrefix = (dogId: string, photoId: string) => `dogs/${dogId}/${photoId}/`;
export const photoKeys = (dogId: string, photoId: string) => ({
  imageKey: `${photoPrefix(dogId, photoId)}full.webp`,
  thumbnailKey: `${photoPrefix(dogId, photoId)}thumb.webp`,
});

export interface PhotoKeys {
  imageKey: string;
  thumbnailKey: string;
}

export const STORAGE_UNAVAILABLE = 'errors.storageUnavailable';

/**
 * Runs a storage call with the service time budget. A failing storage (network, credentials,
 * 5xx) is a dependency outage, so it becomes 503 with a safe message. The SDK error is kept as
 * `cause`, which the error handler logs for 5xx responses; it never reaches the client.
 */
export async function storageCall<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, label);
  } catch (error) {
    // Already meaningful: HTTP errors, our own timeout (→ 503) and "too large" (→ 400 in the service).
    if (error instanceof HttpError || error instanceof TimeoutError || error instanceof ObjectTooLargeError) throw error;
    throw new ServiceUnavailableError(STORAGE_UNAVAILABLE, { cause: error });
  }
}

/** Cleanup that must not fail the request (orphaned private objects only cost storage). */
export async function bestEffort(promise: Promise<unknown>): Promise<void> {
  await promise.catch(() => undefined);
}

export async function signPhoto(storage: ObjectStorage, keys: PhotoKeys): Promise<ImageUrls> {
  const [url, thumbnailUrl] = await Promise.all([
    storage.createDownloadUrl(keys.imageKey, DOWNLOAD_URL_TTL_SECONDS),
    storage.createDownloadUrl(keys.thumbnailKey, DOWNLOAD_URL_TTL_SECONDS),
  ]);
  return { url, thumbnailUrl };
}
