/**
 * Postgres error helpers. Drizzle wraps driver errors in `cause`, so the SQLSTATE can be a few
 * levels down; services use these to turn constraint violations into meaningful HTTP errors.
 */
function sqlState(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return { code: candidate.code, constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined };
    }
    current = candidate.cause;
  }
  return null;
}

/** 23505 unique_violation, optionally for one named constraint/index. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const state = sqlState(error);
  return state?.code === '23505' && (constraint === undefined || state.constraint === constraint);
}
