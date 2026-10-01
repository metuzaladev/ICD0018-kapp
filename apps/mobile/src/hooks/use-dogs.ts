import type { Dog, DogInput, UpdateDogInput } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

export const dogKeys = { all: ['dogs'] as const };

export function useMyDogs() {
  return useQuery({ queryKey: dogKeys.all, queryFn: () => apiGet<Dog[]>('/me/dogs') });
}

/** Create, update and delete share one invalidation: the dog list is small, refetching is cheap. */
export function useSaveDog(dogId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DogInput | UpdateDogInput) =>
      dogId ? apiSend<Dog>('PATCH', `/me/dogs/${dogId}`, input) : apiSend<Dog>('POST', '/me/dogs', input),
    onSuccess: () => client.invalidateQueries({ queryKey: dogKeys.all }),
  });
}

export function useDeleteDog(dogId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<void>('DELETE', `/me/dogs/${dogId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: dogKeys.all }),
  });
}
