import { MAX_PHOTO_BYTES, type PhotoUpload } from '@kapp/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import i18n from '@/i18n';

import { ApiRequestError } from './api';

/**
 * Device side of the photo upload (docs/10-koerad-ja-tervis.md). Images go straight to object
 * storage with a presigned URL; they never pass through our API (64 KB body limit).
 */

/** Larger than the server's 1600 px so its re-encode still has detail; keeps uploads ~0.5–1.5 MB. */
const MAX_UPLOAD_SIDE = 2048;
const UPLOAD_TIMEOUT_MS = 60_000;

export interface PreparedPhoto {
  uri: string;
  blob: Blob;
}

/**
 * Re-encodes the picked photo as a JPEG of at most 2048 px.
 * Why on the device: iPhones shoot HEIC (HEVC), which the server's image library cannot decode,
 * and a 12 MP original would be a slow upload on mobile data. The server still re-encodes and
 * strips all metadata — this step is about format and size, not privacy.
 */
export async function preparePhoto(source: { uri: string; width: number; height: number }): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(source.uri);
  if (Math.max(source.width, source.height) > MAX_UPLOAD_SIDE) {
    context.resize(source.width >= source.height ? { width: MAX_UPLOAD_SIDE } : { height: MAX_UPLOAD_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const blob = await (await fetch(saved.uri)).blob();
  if (blob.size > MAX_PHOTO_BYTES) throw new ApiRequestError(i18n.t('errors.photoTooLarge', { max: MAX_PHOTO_BYTES / 1024 / 1024 }), 400);
  return { uri: saved.uri, blob };
}

/** PUTs the bytes to the presigned URL with exactly the signed headers. */
export async function uploadToStorage(upload: PhotoUpload, photo: PreparedPhoto): Promise<void> {
  let res: Response;
  try {
    res = await fetch(upload.url, {
      method: 'PUT',
      headers: upload.headers,
      body: photo.blob,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch {
    throw new ApiRequestError(i18n.t('errors.uploadNetwork'), 0);
  }
  // Storage answers in XML, not in our { error, message } shape — map it to one safe text.
  if (!res.ok) throw new ApiRequestError(i18n.t('errors.uploadFailed'), res.status);
}

/**
 * The device half of one upload for any feature (dog photos, place posts): re-encode → ask our API
 * for a presigned PUT (the caller names the endpoint) → PUT the bytes with the signed headers.
 * Returns the upload key the feature's create request lists; the server then verifies the bytes,
 * re-encodes them and strips EXIF/GPS.
 */
export async function uploadPickedPhoto(
  picked: { uri: string; width: number; height: number },
  requestUpload: (body: { contentType: 'image/jpeg'; byteSize: number }) => Promise<PhotoUpload>,
): Promise<string> {
  const photo = await preparePhoto(picked);
  const upload = await requestUpload({ contentType: 'image/jpeg', byteSize: photo.blob.size });
  await uploadToStorage(upload, photo);
  return upload.uploadKey;
}
