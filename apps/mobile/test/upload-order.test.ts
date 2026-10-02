import { describe, expect, it } from 'vitest';

import { makeCover, uploadInOrder } from '@/lib/upload-order';

describe('place post photo uploads', () => {
  it('returns upload keys in the order the user arranged the photos, even if later ones finish faster', async () => {
    const delays = [30, 1, 10];
    const started: number[] = [];
    const keys = await uploadInOrder(['a', 'b', 'c'], async (item, i) => {
      started.push(i);
      await new Promise((r) => setTimeout(r, delays[i]));
      return `key-${item}`;
    });
    expect(keys).toEqual(['key-a', 'key-b', 'key-c']);
    // One at a time: each starts after the previous finished.
    expect(started).toEqual([0, 1, 2]);
  });

  it('reports progress before each photo and at the end', async () => {
    const progress: string[] = [];
    await uploadInOrder(['a', 'b'], async (x) => x, (done, total) => progress.push(`${done}/${total}`));
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
  });

  it('stops at the first failure instead of posting with missing photos', async () => {
    const tried: string[] = [];
    await expect(
      uploadInOrder(['a', 'b', 'c'], async (x) => {
        tried.push(x);
        if (x === 'b') throw new Error('upload failed');
        return x;
      }),
    ).rejects.toThrow('upload failed');
    expect(tried).toEqual(['a', 'b']);
  });

  it('no photos → no uploads', async () => {
    expect(await uploadInOrder([], async () => 'x')).toEqual([]);
  });

  it('moves a photo to the cover position keeping the rest in order', () => {
    expect(makeCover(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'a', 'b', 'd']);
    expect(makeCover(['a', 'b'], 0)).toEqual(['a', 'b']);
    expect(makeCover(['a', 'b'], 5)).toEqual(['a', 'b']);
  });
});
