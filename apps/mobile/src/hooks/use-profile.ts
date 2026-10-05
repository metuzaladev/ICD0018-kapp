import type { Profile } from '@kapp/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { apiGet, errorMessage } from '@/lib/api';

/**
 * Own profile from GET /api/v1/me, refreshed whenever the screen regains focus (e.g. after
 * closing the edit modal). Replaced by a TanStack Query hook in M2 when caching is added.
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      apiGet<Profile>('/me')
        .then((p) => active && (setProfile(p), setError(null)))
        .catch((e: unknown) => active && setError(errorMessage(e)));
      return () => {
        active = false;
      };
    }, []),
  );

  return { profile, error };
}
