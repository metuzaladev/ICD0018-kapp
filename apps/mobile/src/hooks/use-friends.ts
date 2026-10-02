import { USER_SEARCH_MIN, type Friend, type FriendPlan, type FriendRequestResult, type FriendRequests, type UserProfile, type UserSearchResult } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

/**
 * Friends, requests, people search, profiles and friends' plans (Community / Friends, Friend
 * Profile, Home). Every change to a relation invalidates the whole ['friends'] and ['users'] tree,
 * because one tap changes several lists (requests, friends, search results, the profile).
 */
export const friendKeys = {
  all: ['friends'] as const,
  list: ['friends', 'list'] as const,
  requests: ['friends', 'requests'] as const,
  plans: ['friends', 'plans'] as const,
};
export const userKeys = {
  all: ['users'] as const,
  search: (q: string) => ['users', 'search', q] as const,
  profile: (userId: string) => ['users', 'profile', userId] as const,
};

export function useFriends() {
  return useQuery({ queryKey: friendKeys.list, queryFn: () => apiGet<Friend[]>('/me/friends') });
}

export function useFriendRequests() {
  return useQuery({ queryKey: friendKeys.requests, queryFn: () => apiGet<FriendRequests>('/me/friend-requests'), staleTime: 30_000 });
}

export function useFriendPlans() {
  return useQuery({ queryKey: friendKeys.plans, queryFn: () => apiGet<FriendPlan[]>('/me/friends/plans') });
}

/** Search starts at 3 letters (the API's minimum); the caller debounces typing. */
export function useUserSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: userKeys.search(q),
    queryFn: () => apiGet<UserSearchResult[]>('/users/search', { q }),
    enabled: q.length >= USER_SEARCH_MIN,
    staleTime: 30_000,
  });
}

export function useUserProfile(userId: string) {
  return useQuery({ queryKey: userKeys.profile(userId), queryFn: () => apiGet<UserProfile>(`/users/${userId}`) });
}

function useInvalidateRelations() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: friendKeys.all });
    client.invalidateQueries({ queryKey: userKeys.all });
    client.invalidateQueries({ queryKey: ['conversations'] });
  };
}

export function useSendFriendRequest() {
  const invalidate = useInvalidateRelations();
  return useMutation({
    mutationFn: (userId: string) => apiSend<FriendRequestResult>('POST', '/me/friend-requests', { userId }),
    onSuccess: invalidate,
  });
}

export function useAcceptFriendRequest() {
  const invalidate = useInvalidateRelations();
  return useMutation({
    mutationFn: (userId: string) => apiSend<void>('POST', `/me/friend-requests/${userId}/accept`),
    onSuccess: invalidate,
  });
}

/** Decline an incoming or cancel an outgoing request. */
export function useDeleteFriendRequest() {
  const invalidate = useInvalidateRelations();
  return useMutation({
    mutationFn: (userId: string) => apiSend<void>('DELETE', `/me/friend-requests/${userId}`),
    onSuccess: invalidate,
  });
}

export function useRemoveFriend() {
  const invalidate = useInvalidateRelations();
  return useMutation({
    mutationFn: (userId: string) => apiSend<void>('DELETE', `/me/friends/${userId}`),
    onSuccess: invalidate,
  });
}
