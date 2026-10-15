import sharp, { type Sharp } from 'sharp';

/** Longer side of the stored versions (px). Thumbnails serve grids and avatars. */
const FULL_SIZE = 1600;
const THUMBNAIL_SIZE = 400;

/**
 * Formats accepted after decoding. The declared Content-Type is not trusted: the bytes decide.
 * SVG, GIF, TIFF etc. are rejected even though sharp could read them (SVG can reference external
 * resources, and none of them come from a phone camera). "heif" covers HEIC/AVIF containers.
 */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

/** Guards against decompression bombs: a 10 MB file can claim 100k × 100k pixels. 48 MP covers phone cameras. */
const MAX_INPUT_PIXELS = 48_000_000;

/** The upload is not a (supported) image. Mapped to 400 by the service. */
export class InvalidImageError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidImageError';
  }
}

export interface ProcessedPhoto {
  full: Buffer;
  thumbnail: Buffer;
}

/**
 * Validates and re-encodes an uploaded photo.
 *
 * Re-encoding is the privacy step: sharp writes no metadata unless asked to, so EXIF (including
 * GPS coordinates of where the photo was taken — often the owner's home), XMP and ICC comments are
 * dropped. The orientation tag is applied to the pixels first, so photos are not shown sideways.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  let image: Sharp;
  let format: string | undefined;
  try {
    // The constructor itself throws for some inputs (e.g. an empty buffer).
    image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    format = (await image.metadata()).format;
  } catch {
    throw new InvalidImageError('not an image');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new InvalidImageError(`unsupported format ${format}`);

  const oriented = image.autoOrient();
  const encode = (size: number, quality: number) =>
    oriented
      .clone()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  try {
    const [full, thumbnail] = await Promise.all([encode(FULL_SIZE, 82), encode(THUMBNAIL_SIZE, 75)]);
    return { full, thumbnail };
  } catch (error) {
    // Truncated files, pixel-limit violations and codecs this libvips build lacks (HEVC-coded HEIC).
    throw new InvalidImageError(error instanceof Error ? error.message : 'decode failed');
  }
}
