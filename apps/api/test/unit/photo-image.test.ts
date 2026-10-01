import exifReader from 'exif-reader';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { InvalidImageError, processPhoto } from '../../src/modules/photos/photo-image';
import { makeCameraJpeg } from '../helpers';

describe('processPhoto', () => {
  it('the fixture really carries GPS and an orientation tag (guards the tests below)', async () => {
    const meta = await sharp(await makeCameraJpeg(300, 200)).metadata();
    expect(meta.orientation).toBe(6);
    expect(exifReader(meta.exif!).GPSInfo).toMatchObject({ GPSLatitudeRef: 'N', GPSLatitude: [59, 26, 18] });
  });

  it('strips all EXIF (incl. GPS), applies orientation and resizes to 1600/400 px WebP', async () => {
    const { full, thumbnail } = await processPhoto(await makeCameraJpeg(2400, 1800));
    const fullMeta = await sharp(full).metadata();
    const thumbMeta = await sharp(thumbnail).metadata();

    expect(fullMeta.format).toBe('webp');
    expect(fullMeta.exif).toBeUndefined();
    expect(fullMeta.xmp).toBeUndefined();
    expect(thumbMeta.exif).toBeUndefined();
    // Orientation 6 = portrait when displayed: 1800 × 2400 → longer side 1600.
    expect([fullMeta.width, fullMeta.height]).toEqual([1200, 1600]);
    expect([thumbMeta.width, thumbMeta.height]).toEqual([300, 400]);
    expect(fullMeta.orientation).toBeUndefined();
  });

  it('never enlarges small photos', async () => {
    const png = await sharp({ create: { width: 320, height: 240, channels: 4, background: '#fff' } }).png().toBuffer();
    const { full, thumbnail } = await processPhoto(png);
    expect((await sharp(full).metadata()).width).toBe(320);
    expect((await sharp(thumbnail).metadata()).width).toBe(320);
  });

  it.each([
    ['plain text', Buffer.from('definitely not an image')],
    ['empty file', Buffer.alloc(0)],
    ['SVG (can reference external resources)', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
  ])('rejects %s', async (_case, bytes) => {
    await expect(processPhoto(bytes)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it('rejects a GIF and a truncated JPEG', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    await expect(processPhoto(gif)).rejects.toBeInstanceOf(InvalidImageError);
    const jpeg = await makeCameraJpeg(400, 300);
    await expect(processPhoto(jpeg.subarray(0, Math.floor(jpeg.length / 2)))).rejects.toBeInstanceOf(InvalidImageError);
  });
});
