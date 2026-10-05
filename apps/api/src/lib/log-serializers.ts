/**
 * pino serializers for request/response logs without personal data (M8, docs/15).
 *
 * Fastify's default request serializer logs the full URL and the client IP. In this API the query
 * string carries personal data — coordinates (`/parks/nearby?lat=…&lng=…`, `/providers?lat=…`) and
 * people search terms (`/users/search?q=…`) — and an IP address is personal data under GDPR. Logs
 * are kept for weeks and often shipped to an external service, so only what debugging needs is
 * kept: method, path (ids are random UUIDs) and the route pattern. Rate limiting and abuse handling
 * do not read logs, so nothing is lost. Credentials are additionally redacted in index.ts.
 */

interface LoggedRequest {
  method: string;
  url: string;
  routeOptions?: { url?: string };
}

interface LoggedReply {
  statusCode: number;
}

/** Path without the query string or fragment. */
export function stripQuery(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

export function serializeRequest(req: LoggedRequest) {
  return { method: req.method, url: stripQuery(req.url), route: req.routeOptions?.url };
}

export function serializeReply(res: LoggedReply) {
  return { statusCode: res.statusCode };
}
