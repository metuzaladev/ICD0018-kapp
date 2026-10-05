import { describe, expect, it } from 'vitest';

import { loadEnv, parseTrustProxy } from '../../src/config/env';

/** A complete, valid production configuration (fake values). */
const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://kapp:secret@db.internal:5432/kapp',
  REDIS_URL: 'rediss://default:secret@redis.internal:6379',
  API_PUBLIC_URL: 'https://api.kapp.example',
  BETTER_AUTH_SECRET: 'a'.repeat(44),
  S3_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'key-id',
  S3_SECRET_ACCESS_KEY: 'key-secret',
};

describe('loadEnv in production', () => {
  it('accepts a complete configuration', () => {
    const env = loadEnv(production);
    expect(env.NODE_ENV).toBe('production');
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.RATE_LIMIT_STORE).toBe('memory');
    expect(env.REALTIME_ADAPTER).toBe('memory');
    expect(env.CONFIG_WARNINGS).toEqual([]);
  });

  it('lists every missing localhost-defaulted setting at once', () => {
    const fn = () => loadEnv({ NODE_ENV: 'production' });
    expect(fn).toThrow(/DATABASE_URL is required/);
    expect(fn).toThrow(/REDIS_URL is required/);
    expect(fn).toThrow(/API_PUBLIC_URL is required/);
    expect(fn).toThrow(/S3_ENDPOINT is required/);
    expect(fn).toThrow(/BETTER_AUTH_SECRET is required/);
    expect(fn).toThrow(/S3_ACCESS_KEY_ID is required/);
  });

  it('treats empty values (KEY= in a .env file) as missing', () => {
    expect(() => loadEnv({ ...production, REDIS_URL: '' })).toThrow(/REDIS_URL is required/);
  });

  it('rejects plain-http public URL, dev secrets and wildcard CORS', () => {
    expect(() => loadEnv({ ...production, API_PUBLIC_URL: 'http://api.kapp.example' })).toThrow(/https/);
    expect(() => loadEnv({ ...production, BETTER_AUTH_SECRET: 'dev-only-insecure-secret-do-not-use-in-production' })).toThrow(/development secret/);
    expect(() => loadEnv({ ...production, S3_SECRET_ACCESS_KEY: 'kapp-dev-secret' })).toThrow(/MinIO/);
    expect(() => loadEnv({ ...production, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadEnv({ ...production, CORS_ORIGINS: 'http://admin.kapp.example' })).toThrow(/CORS_ORIGINS/);
  });

  it('warns (does not fail) on TRUST_PROXY=true', () => {
    expect(loadEnv({ ...production, TRUST_PROXY: 'true' }).CONFIG_WARNINGS).toEqual([expect.stringMatching(/TRUST_PROXY/)]);
  });

  it('accepts the multi-instance settings and rejects unknown values', () => {
    const env = loadEnv({ ...production, RATE_LIMIT_STORE: 'redis', REALTIME_ADAPTER: 'redis', SHUTDOWN_TIMEOUT_MS: '20000' });
    expect(env.RATE_LIMIT_STORE).toBe('redis');
    expect(env.REALTIME_ADAPTER).toBe('redis');
    expect(env.SHUTDOWN_TIMEOUT_MS).toBe(20000);
    expect(() => loadEnv({ ...production, RATE_LIMIT_STORE: 'memcached' })).toThrow();
    expect(() => loadEnv({ ...production, LOG_LEVEL: 'verbose' })).toThrow();
  });
});

describe('loadEnv in development', () => {
  it('still works with no variables at all (docker-compose defaults)', () => {
    const env = loadEnv({});
    expect(env.DATABASE_URL).toContain('localhost');
    expect(env.CONFIG_WARNINGS).toEqual([]);
    expect(env.LOG_LEVEL).toBeUndefined();
  });
});

describe('parseTrustProxy', () => {
  it('parses booleans, hop counts and address lists', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12')).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    expect(parseTrustProxy('fd00::/8')).toEqual(['fd00::/8']);
  });

  it('rejects anything else so a typo fails at startup', () => {
    expect(parseTrustProxy('yes')).toBeNull();
    expect(parseTrustProxy('loadbalancer.internal')).toBeNull();
    expect(() => loadEnv({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
