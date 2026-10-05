import { matchLanguage, parseAcceptLanguage } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

import { requestLanguage } from '../../src/http/language';

describe('parseAcceptLanguage', () => {
  it.each([
    // missing / empty → Estonian
    [undefined, 'et'],
    [null, 'et'],
    ['', 'et'],
    ['   ', 'et'],
    // plain tags
    ['et', 'et'],
    ['en', 'en'],
    ['ru', 'ru'],
    // region and script tags match their language, any case, - or _
    ['ru-RU', 'ru'],
    ['en-GB', 'en'],
    ['EN-us', 'en'],
    ['et_EE', 'et'],
    ['ru-Cyrl-RU', 'ru'],
    // q-values: highest wins, ties keep header order
    ['et;q=0.5, ru;q=0.9', 'ru'],
    ['de-DE, ru;q=0.8, en;q=0.9', 'en'],
    ['fi, en;q=0.5, ru;q=0.5', 'en'],
    ['ru;q=0.5, en;q=0.5', 'ru'],
    ['en;q=1.0, ru', 'en'],
    // q=0 means "not acceptable"
    ['ru;q=0, en;q=0.1', 'en'],
    ['ru;q=0', 'et'],
    // unknown languages and wildcard → Estonian
    ['de-DE, fr;q=0.8', 'et'],
    ['*', 'et'],
    ['de, *;q=0.5, ru;q=0.1', 'et'],
    // garbage does not throw
    ['en;q=abc, ru;q=0.2', 'ru'],
    [',,;q=1,', 'et'],
  ] as const)('%s → %s', (header, expected) => {
    expect(parseAcceptLanguage(header)).toBe(expected);
  });

  it('accepts a header repeated as an array', () => {
    expect(parseAcceptLanguage(['fi', 'ru-RU;q=0.7'])).toBe('ru');
  });

  it('ignores ranges past the first 20 (absurd headers)', () => {
    const header = [...Array.from({ length: 20 }, (_, i) => `x${i};q=0.9`), 'ru;q=1'].join(',');
    expect(parseAcceptLanguage(header)).toBe('et');
  });
});

describe('matchLanguage', () => {
  it.each([
    ['ru-RU', 'ru'],
    ['en', 'en'],
    ['de', null],
    [undefined, null],
    ['', null],
  ] as const)('%s → %s', (tag, expected) => {
    expect(matchLanguage(tag)).toBe(expected);
  });
});

describe('requestLanguage', () => {
  it('reads the Accept-Language header', () => {
    expect(requestLanguage({ headers: { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' } })).toBe('ru');
    expect(requestLanguage({ headers: {} })).toBe('et');
  });
});
