/**
 * The signed-in user's Käpad balance (Figma "Points Badge").
 *
 * Placeholder until M9b adds the rewards API: it returns `null`, and every PointsBadge hides itself,
 * so production UI never shows an invented number. M9b replaces the body with a TanStack query
 * (`['rewards', 'balance']`) — callers already handle "no data" and need no change.
 */
export function usePointsBalance(): number | null {
  return null;
}
