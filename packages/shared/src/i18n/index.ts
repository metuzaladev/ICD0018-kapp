import { en } from './en';
import { et, type MessageKey, type Messages } from './et';
import { ru } from './ru';

/**
 * Languages of the app and the API. Estonian is the source language and the fallback:
 * anything unknown (device language, Accept-Language) ends up in Estonian.
 */
export const LANGUAGES = ['et', 'en', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'et';

export type { MessageKey, Messages };
export type MessageParams = Record<string, string | number>;

export const MESSAGES: Record<Language, Messages> = { et, en, ru };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** "ru-RU", "en_GB", "ET" → a supported language by its primary subtag, or null. */
export function matchLanguage(tag: string | null | undefined): Language | null {
  const primary = tag?.trim().split(/[-_]/)[0]?.toLowerCase();
  return isLanguage(primary) ? primary : null;
}

/** Ignore absurdly long headers: real clients send a handful of ranges. */
const MAX_RANGES = 20;

/**
 * Picks the response language from an Accept-Language header (RFC 9110 §12.5.4):
 * highest q-value first, ties in header order, region tags match their language
 * (`ru-RU` → ru), `q=0` means "not acceptable". `*`, unsupported or missing → Estonian.
 */
export function parseAcceptLanguage(header: string | readonly string[] | null | undefined): Language {
  const value = typeof header === 'string' ? header : header?.join(',');
  if (!value) return DEFAULT_LANGUAGE;

  const ranges = value
    .split(',')
    .slice(0, MAX_RANGES)
    .map((part, index) => {
      const [tag = '', ...params] = part.split(';').map((s) => s.trim());
      const qParam = params.find((p) => p.toLowerCase().startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { tag, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((r) => r.tag !== '' && r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const range of ranges) {
    if (range.tag === '*') return DEFAULT_LANGUAGE;
    const language = matchLanguage(range.tag);
    if (language) return language;
  }
  return DEFAULT_LANGUAGE;
}

/** `{{name}}` placeholders — the same syntax as i18next in the app, so one checker covers both. */
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** Message for a key in a language; a missing param is left visible instead of printing "undefined". */
export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  const template = MESSAGES[language]?.[key] ?? MESSAGES[DEFAULT_LANGUAGE][key];
  return template.replace(PLACEHOLDER, (match, name: string) => (params && name in params ? String(params[name]) : match));
}

/** Placeholder names of a template, sorted — used by the i18n checks. */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!))].sort();
}
