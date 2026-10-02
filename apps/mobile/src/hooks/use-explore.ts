import type {
  CreatePlacePostInput,
  MapPlace,
  MapTag,
  PhotoUpload,
  PlacePost,
  PlacePostPage,
  PlacePostReactions,
  PlacePostReportInput,
} from '@kapp/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';
import { patchPostData, toggledLike, type Bbox } from '@/lib/explore';
import { uploadPickedPhoto } from '@/lib/photo-upload';
import { uploadInOrder } from '@/lib/upload-order';

import { rewardKeys } from './use-rewards';

/**
 * Avasta (docs/16): community place posts, likes/bookmarks, reports, "Soovita kohta" and the map
 * pins. Every post list lives under ['place-posts'] so one invalidation refreshes all of them.
 */
export const exploreKeys = {
  all: ['place-posts'] as const,
  feed: (params: Record<string, string | number>) => ['place-posts', 'feed', params] as const,
  detail: (postId: string) => ['place-posts', 'detail', postId] as const,
  mine: ['place-posts', 'mine'] as const,
  saved: ['place-posts', 'saved'] as const,
  map: (bbox: Bbox | null, tags: MapTag[] | undefined) => ['map-places', bbox, tags ?? 'all'] as const,
};

/**
 * Post photos are signed for 15 minutes (private bucket). Stale after 5 minutes means a refetch on
 * focus replaces the links long before they expire — the same rule as dog photos (use-photos.ts);
 * the images stay in the expo-image cache by object path (`photoSource`).
 */
const SIGNED_URL_STALE_MS = 5 * 60_000;

function pagedPosts(key: readonly unknown[], path: string, params: Record<string, string | number> = {}, enabled = true) {
  return {
    queryKey: key,
    queryFn: ({ pageParam }: { pageParam: string | null }) => apiGet<PlacePostPage>(path, pageParam ? { ...params, before: pageParam } : params),
    initialPageParam: null as string | null,
    getNextPageParam: (last: PlacePostPage) => last.nextCursor,
    staleTime: SIGNED_URL_STALE_MS,
    enabled,
  };
}

/** GET /place-posts: approved posts plus the viewer's own pending ones, newest first. */
export function usePlacePostFeed(params: Record<string, string | number>) {
  return useInfiniteQuery({
    ...pagedPosts(exploreKeys.feed(params), '/place-posts', params),
    // Keep the old list while another filter loads, instead of flashing the skeleton.
    placeholderData: (previous) => previous,
  });
}

export function usePlacePost(postId: string) {
  return useQuery({ queryKey: exploreKeys.detail(postId), queryFn: () => apiGet<PlacePost>(`/place-posts/${postId}`), staleTime: SIGNED_URL_STALE_MS });
}

export function useMyPlacePosts(enabled = true) {
  return useInfiniteQuery(pagedPosts(exploreKeys.mine, '/me/place-posts', {}, enabled));
}

export function useSavedPlacePosts(enabled = true) {
  return useInfiniteQuery(pagedPosts(exploreKeys.saved, '/me/place-posts/saved', {}, enabled));
}

/** Applies a patch to the post in every cached list and its detail. */
function patchEverywhere(client: QueryClient, postId: string, patch: Partial<PlacePostReactions>) {
  client.setQueriesData<PlacePost | { pages: PlacePostPage[]; pageParams: unknown[] }>({ queryKey: exploreKeys.all }, (data) =>
    patchPostData(data, postId, patch),
  );
}

function findCached(client: QueryClient, postId: string): PlacePost | undefined {
  for (const [, data] of client.getQueriesData<PlacePost | { pages: PlacePostPage[] }>({ queryKey: exploreKeys.all })) {
    if (!data) continue;
    if ('pages' in data) {
      const hit = data.pages.flatMap((p) => p.items).find((p) => p.id === postId);
      if (hit) return hit;
    } else if (data.id === postId) {
      return data;
    }
  }
  return undefined;
}

/**
 * Heart and bookmark with an optimistic update. The request names the wanted state (PUT = on,
 * DELETE = off), so a retry or a double tap cannot flip it twice (idempotent API); the answer is
 * the server's state and replaces the guess. On failure every cache is rolled back.
 */
export function useTogglePostReaction(kind: 'like' | 'save') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, on }: { postId: string; on: boolean }) =>
      apiSend<PlacePostReactions>(on ? 'PUT' : 'DELETE', `/place-posts/${postId}/${kind}`),
    onMutate: async ({ postId, on }) => {
      await client.cancelQueries({ queryKey: exploreKeys.all });
      const snapshot = client.getQueriesData({ queryKey: exploreKeys.all });
      const post = findCached(client, postId);
      if (post) {
        if (kind === 'like' && post.liked !== on) patchEverywhere(client, postId, toggledLike(post));
        if (kind === 'save') patchEverywhere(client, postId, { saved: on });
      }
      return { snapshot };
    },
    onError: (_error, _vars, context) => context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data)),
    onSuccess: (state, { postId }) => {
      patchEverywhere(client, postId, state);
      // The "Salvestatud" list gains or loses the post.
      if (kind === 'save') client.invalidateQueries({ queryKey: exploreKeys.saved });
    },
  });
}

export function useReportPlacePost(postId: string) {
  return useMutation({ mutationFn: (input: PlacePostReportInput) => apiSend<{ id: string }>('POST', `/place-posts/${postId}/reports`, input) });
}

export function useDeletePlacePost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiSend<void>('DELETE', `/me/place-posts/${postId}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: exploreKeys.all });
      client.invalidateQueries({ queryKey: ['map-places'] });
    },
  });
}

export type PickedPhoto = { uri: string; width: number; height: number };

/**
 * "Soovita kohta": photos first (each re-encoded on the device and PUT to its own presigned URL, in
 * the order the user arranged them), then the post with their upload keys. The new post is
 * `pending` and appears at the top of the author's feed with "Ootab kinnitust".
 */
export function useCreatePlacePost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      photos,
      onProgress,
    }: {
      input: Omit<CreatePlacePostInput, 'photoUploadKeys'>;
      photos: PickedPhoto[];
      onProgress?: (done: number, total: number) => void;
    }) => {
      const photoUploadKeys = await uploadInOrder(
        photos,
        (photo) => uploadPickedPhoto(photo, (body) => apiSend<PhotoUpload>('POST', '/me/place-posts/uploads', body)),
        onProgress,
      );
      return apiSend<PlacePost>('POST', '/me/place-posts', { ...input, photoUploadKeys });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: exploreKeys.all });
      client.invalidateQueries({ queryKey: rewardKeys.all });
    },
  });
}

/**
 * GET /map/places for the visible box. Pins stay while a new box loads (no flashing), and a box
 * already seen is served from the cache (the box is snapped to a grid, lib/explore.ts).
 */
export function useMapPlaces(bbox: Bbox | null, tags: MapTag[] | undefined) {
  return useQuery({
    queryKey: exploreKeys.map(bbox, tags),
    queryFn: () => {
      const params: Record<string, string | number> = { ...bbox! };
      if (tags) params.tags = tags.join(',');
      return apiGet<MapPlace[]>('/map/places', params);
    },
    enabled: bbox !== null,
    placeholderData: (previous) => previous,
    staleTime: 5 * 60_000,
  });
}
