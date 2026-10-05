/**
 * Graceful shutdown on SIGTERM/SIGINT (M8, docs/15-pakendamine-ja-levitamine.md).
 *
 * Why a separate, tested function instead of a few awaits in index.ts:
 * - containers are stopped with SIGTERM and killed (SIGKILL) after a grace period (Docker 10 s by
 *   default). A close step that hangs — a BullMQ job waiting on Expo, a stuck Redis connection —
 *   must not keep the process alive until it is killed mid-write, so there is an overall deadline;
 * - one failing step (Redis already gone) must not skip the rest: the database pool still has to
 *   be ended, so each step's error is logged and the next one runs;
 * - platforms often send the signal twice (or SIGINT after SIGTERM); a second shutdown would close
 *   things twice and race with the first, so later signals are ignored.
 *
 * Steps run in order. index.ts closes the HTTP server first (stop taking requests, finish in-flight
 * ones, disconnect sockets), then the workers (let running jobs finish; unfinished jobs stay in
 * Redis and are retried by the next instance), then the queues and connections.
 */

export interface ShutdownStep {
  name: string;
  close: () => Promise<unknown>;
}

export interface ShutdownLogger {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface ShutdownOptions {
  steps: ShutdownStep[];
  /** Overall deadline; keep it below the platform's grace period (docker stop -t, kill_timeout). */
  timeoutMs: number;
  log: ShutdownLogger;
  /** process.exit in production; a spy in tests. */
  exit: (code: number) => void;
}

/** Returns the signal handler. Exit code 0 when every step closed in time, 1 otherwise. */
export function createShutdown({ steps, timeoutMs, log, exit }: ShutdownOptions): (signal: string) => Promise<void> {
  let started = false;

  return async (signal) => {
    if (started) {
      log.info({ signal }, 'shutdown already in progress');
      return;
    }
    started = true;
    log.info({ signal, timeoutMs }, 'shutting down');

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      log.error({ timeoutMs }, 'shutdown timed out, exiting');
      exit(1);
    }, timeoutMs);
    // The deadline itself must never keep the process alive.
    timer.unref?.();

    let code = 0;
    for (const step of steps) {
      if (finished) return; // deadline passed while a step was hanging
      try {
        await step.close();
      } catch (err) {
        code = 1;
        log.error({ err, step: step.name }, 'shutdown step failed');
      }
    }

    if (finished) return;
    finished = true;
    clearTimeout(timer);
    log.info({ code }, 'shutdown complete');
    exit(code);
  };
}
