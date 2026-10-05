import { useRewards } from './use-rewards';

/**
 * The signed-in user's spendable Käpad (Figma "Points Badge"), from GET /me/rewards (M9b).
 * `null` while unknown (loading, offline without cache, error): every PointsBadge then hides
 * itself, so the UI never shows an invented number.
 */
export function usePointsBalance(): number | null {
  return useRewards().data?.balance ?? null;
}
