/** Thrown when an awaited operation exceeds its time budget. */
export class TimeoutError extends Error {
  constructor(readonly label: string, readonly ms: number) {
    super(`${label} timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects with TimeoutError if `promise` does not settle within `ms`.
 *
 * Why: a hung database connection or external API must not hold a request (and a pool
 * connection) forever. The service layer wraps every dependency call so the client gets a
 * fast 503 instead of a client-side timeout. Note that the underlying work is not cancelled;
 * Postgres' own `statement_timeout` (config/env.ts) stops the query on the server side.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
