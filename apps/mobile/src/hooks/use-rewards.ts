import type { ClaimInviteInput, Invite, RewardHistoryPage, RewardsSummary } from '@kapp/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

/**
 * Käpad (docs/16-avasta-ja-kapad.md): balance, level, streak, badges, "Kuidas teenida", history and
 * the invite code. Read-only except the invite claim: points are only ever awarded by the server.
 */
export const rewardKeys = {
  all: ['rewards'] as const,
  summary: ['rewards', 'summary'] as const,
  history: ['rewards', 'history'] as const,
  invite: ['rewards', 'invite'] as const,
};

/**
 * GET /me/rewards also settles pending awards on the server (e.g. a check-in that expired by
 * itself), so it is the one place the balance becomes current. Shared by every PointsBadge and the
 * Käpad screen; 60 s stale like the rest of the app, refetched when the app returns to the
 * foreground.
 */
export function useRewards(enabled = true) {
  return useQuery({ queryKey: rewardKeys.summary, queryFn: () => apiGet<RewardsSummary>('/me/rewards'), enabled });
}

export function useRewardHistory() {
  return useInfiniteQuery({
    queryKey: rewardKeys.history,
    queryFn: ({ pageParam }) => apiGet<RewardHistoryPage>('/me/rewards/history', pageParam ? { before: pageParam } : undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useInvite() {
  // The code never changes; the amount comes from the server's rule table.
  return useQuery({ queryKey: rewardKeys.invite, queryFn: () => apiGet<Invite>('/me/invite'), staleTime: 30 * 60_000 });
}

export function useClaimInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ClaimInviteInput) => apiSend<void>('POST', '/me/invite/claim', input),
    onSuccess: () => client.invalidateQueries({ queryKey: rewardKeys.all }),
  });
}
