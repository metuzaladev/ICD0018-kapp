import { useState } from 'react';

/**
 * State for a screen's pull-to-refresh: runs the given refetches (TanStack Query `refetch`
 * functions of the screen's own hooks) and keeps the spinner until all have settled. A failed
 * refetch ends the spinner too; the query's own error state shows what went wrong.
 */
export function usePullToRefresh(...refetches: (() => Promise<unknown>)[]) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    Promise.allSettled(refetches.map((refetch) => refetch())).finally(() => setRefreshing(false));
  };
  return { refreshing, onRefresh };
}
