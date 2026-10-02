import type { Server as HttpServer } from 'node:http';

import { REALTIME_PATH, type RealtimeEvents } from '@kapp/shared';
import { Server, type ServerOptions } from 'socket.io';

import type { ResolveUserId } from '../http/auth';

/**
 * Realtime delivery (M5): Socket.IO on the same HTTP server as the REST API.
 *
 * Why Socket.IO instead of a plain WebSocket or SSE (docs/12-kogukond.md):
 * - reconnection with backoff, heartbeats and per-user rooms are built in, a plain `ws` server
 *   would need all of that written and tested by hand;
 * - it falls back to HTTP long-polling where WebSockets are blocked (some mobile networks, proxies);
 * - SSE is one-way too, but React Native has no EventSource and SSE streams are cut by iOS when the
 *   app is backgrounded just like sockets, so it offers nothing extra;
 * - `socket.io-client` is pure JavaScript, so it works in the Expo app without a native module.
 *
 * The channel is server → client only. Every write (sending a message, marking read) goes through
 * the REST API, so validation, rate limits, auth and the `{ error, message }` contract stay in one
 * place. Each socket joins the room `user:<id>` after the handshake is authenticated with the same
 * Better Auth session cookie as REST, and events are emitted only to the rooms of the users they
 * concern (conversation members, notification recipient).
 *
 * One instance needs nothing else. With several instances pass the Redis adapter
 * (REALTIME_ADAPTER=redis → lib/redis-clients.ts) so an emit reaches sockets connected to the
 * other instances; room joins and `fetchSockets` then work across instances too (docs/15).
 */
export interface RealtimeGateway {
  emitToUsers<E extends keyof RealtimeEvents>(userIds: string[], event: E, payload: Parameters<RealtimeEvents[E]>[0]): void;
}

/** For tests and for code paths that run without a server (seed scripts). */
export const noRealtime: RealtimeGateway = { emitToUsers: () => {} };

export interface SocketGateway extends RealtimeGateway {
  attach(server: HttpServer, options: AttachOptions): void;
  close(): Promise<void>;
  /** Number of connected sockets for a user — used by tests and diagnostics. */
  connectionCount(userId: string): Promise<number>;
}

interface AttachOptions {
  resolveUserId: ResolveUserId;
  corsOrigins: string[];
  log?: { warn: (obj: object, msg: string) => void };
}

export const userRoom = (userId: string) => `user:${userId}`;

interface SocketData {
  userId: string;
}

/**
 * Created before the HTTP app (services need something to emit to) and attached to the server in
 * buildApp. Emitting before `attach` is a no-op: there cannot be any connected clients yet.
 */
export function createSocketGateway(options: { adapter?: ServerOptions['adapter'] } = {}): SocketGateway {
  let io: Server<Record<string, never>, RealtimeEvents, Record<string, never>, SocketData> | null = null;

  return {
    attach(server, { resolveUserId, corsOrigins, log }) {
      io = new Server(server, {
        path: REALTIME_PATH,
        // Native apps send no Origin; browsers are allowed only when listed, like the REST CORS rule.
        cors: { origin: corsOrigins.length > 0 ? corsOrigins : false },
        // Clients never send events, so big frames are never legitimate.
        maxHttpBufferSize: 16 * 1024,
        serveClient: false,
        ...(options.adapter ? { adapter: options.adapter } : {}),
      });

      io.use(async (socket, next) => {
        // React Native WebSockets can send the cookie as a header (`extraHeaders`); the handshake
        // `auth` payload is accepted too because not every transport lets the client set headers.
        const headers = { ...socket.handshake.headers };
        const authCookie = (socket.handshake.auth as { cookie?: unknown } | undefined)?.cookie;
        if (!headers.cookie && typeof authCookie === 'string' && authCookie.length < 8192) headers.cookie = authCookie;
        try {
          const userId = await resolveUserId({ headers });
          if (!userId) return next(new Error('unauthorized'));
          socket.data.userId = userId;
          await socket.join(userRoom(userId));
          return next();
        } catch (error) {
          // Session store down: the client retries with backoff and polls REST meanwhile.
          log?.warn({ err: error }, 'realtime handshake failed');
          return next(new Error('unavailable'));
        }
      });
    },

    emitToUsers(userIds, event, payload) {
      if (!io || userIds.length === 0) return;
      // Socket.IO's generic emit signature cannot be narrowed per event name here.
      (io.to([...new Set(userIds)].map(userRoom)).emit as (e: string, p: unknown) => boolean)(event, payload);
    },

    async connectionCount(userId) {
      if (!io) return 0;
      return (await io.in(userRoom(userId)).fetchSockets()).length;
    },

    async close() {
      if (!io) return;
      // Disconnects clients but leaves the HTTP server to Fastify, which closes it itself.
      // (io.close() would also close the HTTP server and race with Fastify's own close.)
      io.disconnectSockets(true);
      io.engine.close();
      io = null;
    },
  };
}
