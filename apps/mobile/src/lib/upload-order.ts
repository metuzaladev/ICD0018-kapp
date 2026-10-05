/**
 * Uploads a post's photos one after another and returns their upload keys in the order the user
 * arranged them (position 0 is the cover photo in the feed; the server stores `position` from the
 * order of `photoUploadKeys`).
 *
 * Why sequential, not parallel: each photo is a 0.5–1.5 MB PUT on mobile data, and five at once
 * would compete for the same bandwidth, make every one slower and risk the 60 s timeout. One at a
 * time also gives a meaningful "Laen fotot 2/5" progress. The first failure stops the run: a post
 * with silently missing photos would be worse than an error the user can retry.
 *
 * Pure (the upload step is injected), unit-tested in test/upload-order.test.ts.
 */
export async function uploadInOrder<T>(
  items: readonly T[],
  upload: (item: T, index: number) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const keys: string[] = [];
  for (const [index, item] of items.entries()) {
    onProgress?.(index, items.length);
    keys.push(await upload(item, index));
  }
  onProgress?.(items.length, items.length);
  return keys;
}

/** Moves the photo at `from` to the front (cover) without changing the others' order. */
export function makeCover<T>(items: readonly T[], from: number): T[] {
  if (from <= 0 || from >= items.length) return [...items];
  const copy = [...items];
  const [cover] = copy.splice(from, 1);
  return [cover!, ...copy];
}
