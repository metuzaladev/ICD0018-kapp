import { describe, expect, it } from 'vitest';

import { isReleaseProfile, releaseConfigProblems } from '../app.config';

const ok = { apiUrl: 'https://api.kapp.example', projectId: '00000000-0000-4000-8000-000000000000' };

describe('releaseConfigProblems', () => {
  it('accepts a complete preview and production config', () => {
    expect(releaseConfigProblems({ profile: 'preview', ...ok })).toEqual([]);
    expect(releaseConfigProblems({ profile: 'production', ...ok })).toEqual([]);
  });

  it('never blocks development builds or local runs (no profile)', () => {
    expect(releaseConfigProblems({ profile: 'development', apiUrl: undefined, projectId: undefined })).toEqual([]);
    expect(releaseConfigProblems({ profile: undefined, apiUrl: 'http://localhost:3000', projectId: undefined })).toEqual([]);
  });

  it('rejects a missing (null/empty) API URL', () => {
    expect(releaseConfigProblems({ profile: 'preview', ...ok, apiUrl: undefined })[0]).toMatch(/not set/);
    expect(releaseConfigProblems({ profile: 'preview', ...ok, apiUrl: '' })[0]).toMatch(/not set/);
  });

  it('rejects invalid, plain-http, local and path URLs', () => {
    expect(releaseConfigProblems({ profile: 'production', ...ok, apiUrl: 'api.kapp.example' })[0]).toMatch(/not a valid URL/);
    expect(releaseConfigProblems({ profile: 'production', ...ok, apiUrl: 'http://api.kapp.example' })[0]).toMatch(/https/);
    expect(releaseConfigProblems({ profile: 'production', ...ok, apiUrl: 'https://192.168.1.20:3000' })[0]).toMatch(/local/);
    expect(releaseConfigProblems({ profile: 'production', ...ok, apiUrl: 'https://localhost' })[0]).toMatch(/local/);
    expect(releaseConfigProblems({ profile: 'production', ...ok, apiUrl: 'https://api.kapp.example/api/v1' })[0]).toMatch(/origin/);
  });

  it('requires the EAS project id for push tokens', () => {
    expect(releaseConfigProblems({ profile: 'preview', ...ok, projectId: undefined })).toEqual([expect.stringMatching(/projectId/)]);
  });

  it('knows which profiles are release profiles', () => {
    expect(isReleaseProfile('preview')).toBe(true);
    expect(isReleaseProfile('production')).toBe(true);
    expect(isReleaseProfile('development')).toBe(false);
    expect(isReleaseProfile(undefined)).toBe(false);
  });
});
