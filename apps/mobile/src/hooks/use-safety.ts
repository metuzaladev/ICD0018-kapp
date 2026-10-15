import type { BlockedUser, UpdateProfileInput, Profile, UserReportInput } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

/** Blocking, reporting and the privacy settings (Safety / Report or Block, Settings / Privacy). */
const safetyKeys = { blocks: ['blocks'] as const };
export const ownProfileKey = ['me'] as const;

export function useBlockedUsers() {
  return useQuery({ queryKey: safetyKeys.blocks, queryFn: () => apiGet<BlockedUser[]>('/me/blocks') });
}

/** A block changes almost every social list, so everything social is refetched. */
function useInvalidateSocial() {
  const client = useQueryClient();
  return () => {
    // M9b: place posts and map pins of a blocked author disappear too (block-sql on the server).
    for (const key of [safetyKeys.blocks, ['friends'], ['users'], ['conversations'], ['notifications'], ['visits'], ['place-posts'], ['map-places']]) {
      client.invalidateQueries({ queryKey: key });
    }
  };
}

export function useBlockUser() {
  const invalidate = useInvalidateSocial();
  return useMutation({ mutationFn: (userId: string) => apiSend<void>('PUT', `/me/blocks/${userId}`), onSuccess: invalidate });
}

export function useUnblockUser() {
  const invalidate = useInvalidateSocial();
  return useMutation({ mutationFn: (userId: string) => apiSend<void>('DELETE', `/me/blocks/${userId}`), onSuccess: invalidate });
}

export function useReportUser(userId: string) {
  return useMutation({ mutationFn: (input: UserReportInput) => apiSend<{ id: string }>('POST', `/users/${userId}/reports`, input) });
}

/** Own profile as a cached query, for settings switches (allow requests, presence sharing). */
export function useOwnProfile() {
  return useQuery({ queryKey: ownProfileKey, queryFn: () => apiGet<Profile>('/me') });
}

export function useUpdateOwnProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateProfileInput) => apiSend<Profile>('PATCH', '/me', patch),
    onSuccess: (profile) => client.setQueryData(ownProfileKey, profile),
  });
}
