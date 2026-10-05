import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { buildTestApp } from '../helpers';
import { serializeReply, serializeRequest, stripQuery } from '../../src/lib/log-serializers';

describe('stripQuery', () => {
  it('removes query strings and fragments', () => {
    expect(stripQuery('/api/v1/parks/nearby?lat=59.43&lng=24.75')).toBe('/api/v1/parks/nearby');
    expect(stripQuery('/api/v1/users/search?q=Mari#x')).toBe('/api/v1/users/search');
    expect(stripQuery('/health')).toBe('/health');
    expect(stripQuery('')).toBe('');
  });
});

describe('serializeRequest / serializeReply', () => {
  it('keeps method, path and route only — no IP, host or query', () => {
    const req = { method: 'GET', url: '/api/v1/parks/nearby?lat=59&lng=24', ip: '203.0.113.7', hostname: 'api', routeOptions: { url: '/api/v1/parks/nearby' } };
    expect(serializeRequest(req)).toEqual({ method: 'GET', url: '/api/v1/parks/nearby', route: '/api/v1/parks/nearby' });
    expect(serializeReply({ statusCode: 404 })).toEqual({ statusCode: 404 });
  });

  it('handles an unmatched route (no routeOptions url)', () => {
    expect(serializeRequest({ method: 'GET', url: '/nope?x=1' })).toEqual({ method: 'GET', url: '/nope', route: undefined });
  });

  it('keeps coordinates and IPs out of real Fastify request logs', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const logger = pino({ serializers: { req: serializeRequest, res: serializeReply } }, stream);
    const ctx = await buildTestApp({}, { logger });
    try {
      await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/nearby?lat=59.4371&lng=24.7536', remoteAddress: '203.0.113.7' });
    } finally {
      await ctx.app.close();
    }
    const log = lines.join('');
    expect(log).toContain('/api/v1/parks/nearby');
    expect(log).not.toContain('59.4371');
    expect(log).not.toContain('203.0.113.7');
  });
});
