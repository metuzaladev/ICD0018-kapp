import type { AddDogPhotoInput, Dog, DogPhoto, PhotoUpload } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';
import { preparePhoto, uploadToStorage } from '@/lib/photo-upload';

import { dogKeys } from './use-dogs';

export const photoKeys = { dog: (dogId: string) => ['dogs', dogId, 'photos'] as const };

/**
 * Photo URLs are signed for 15 minutes. Treating the list as stale after 5 minutes means a
 * refetch on focus always replaces links long before they expire; images themselves stay in the
 * expo-image cache by photo id (see `photoSource`).
 */
const SIGNED_URL_STALE_MS = 5 * 60_000;

export function useDogPhotos(dogId: string) {
  return useQuery({
    queryKey: photoKeys.dog(dogId),
    queryFn: () => apiGet<DogPhoto[]>(`/me/dogs/${dogId}/photos`),
    staleTime: SIGNED_URL_STALE_MS,
  });
}

/**
 * expo-image source for a signed photo URL. The cache key is the URL without its signature (the
 * object path): object keys contain the photo id and never change, while the signature does on
 * every fetch — keying by the full URL would download the same image again and again.
 */
export function photoSource(url: string) {
  return { uri: url, cacheKey: url.split('?')[0] };
}

/** The whole three-step flow: re-encode on device → presigned PUT → server processes. */
export function useAddPhoto(dogId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (picked: { uri: string; width: number; height: number }) => {
      const photo = await preparePhoto(picked);
      const upload = await apiSend<PhotoUpload>('POST', `/me/dogs/${dogId}/photos/uploads`, {
        contentType: 'image/jpeg',
        byteSize: photo.blob.size,
      });
      await uploadToStorage(upload, photo);
      const input: AddDogPhotoInput = { uploadKey: upload.uploadKey, caption: null };
      return apiSend<DogPhoto>('POST', `/me/dogs/${dogId}/photos`, input);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: photoKeys.dog(dogId) }),
  });
}

export function useDeletePhoto(dogId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => apiSend<void>('DELETE', `/me/dogs/${dogId}/photos/${photoId}`),
    // The deleted photo may have been the profile picture, so the dog list changes too.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: photoKeys.dog(dogId) });
      client.invalidateQueries({ queryKey: dogKeys.all, exact: true });
    },
  });
}

export function useSetProfilePhoto(dogId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string | null) => apiSend<Dog>('PUT', `/me/dogs/${dogId}/profile-photo`, { photoId }),
    onSuccess: () => client.invalidateQueries({ queryKey: dogKeys.all, exact: true }),
  });
}
