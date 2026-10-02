import type { ParkVisitor } from '@kapp/shared';
import { useMemo } from 'react';

import { useFriends } from '@/hooks/use-friends';
import { useParkVisitors } from '@/hooks/use-visits';

/**
 * Friends who are in a park right now (Figma Park Card "3 sõpra pargis"): the park's visible
 * visitors (M3, already filtered by presence sharing and blocks on the server) intersected with the
 * friends list (M5). No new API: both queries exist and are cached; the friends list is shared by
 * every card. `enabled: false` skips the visitors request (e.g. a park with no dogs at all).
 */
export function useFriendsInPark(parkId: string, enabled = true): ParkVisitor[] {
  const visitors = useParkVisitors(parkId, enabled);
  const friends = useFriends();
  return useMemo(() => {
    if (!visitors.data || !friends.data) return [];
    const ids = new Set(friends.data.map((f) => f.id));
    return visitors.data.visitors.filter((v) => !v.isMe && ids.has(v.userId));
  }, [visitors.data, friends.data]);
}
