import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fieldErrors, MESSAGES, signUpInputSchema, translate, updateProfileInputSchema } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

import { checkTables, flatten } from '../../../../packages/shared/src/i18n/check';

/**
 * The same rules as `npm run i18n:check`, so a broken translation also fails `npm test`:
 * identical keys and {{param}} placeholders in et/en/ru, the plural forms each language needs,
 * no empty values. (The hard-coded string scan only runs in the script.)
 */

const mobileLocales = (dir: string) =>
  Object.fromEntries(
    ['et', 'en', 'ru'].map((l) => [l, flatten(JSON.parse(readFileSync(join(__dirname, '../../../mobile/src/i18n', dir, `${l}.json`), 'utf8')))]),
  );

describe('translation tables', () => {
  it('shared message tables match', () => {
    expect(checkTables({ et: { ...MESSAGES.et }, en: { ...MESSAGES.en }, ru: { ...MESSAGES.ru } }, { plurals: false, label: 'shared' })).toEqual([]);
  });

  it('app locale files match, including plural forms', () => {
    expect(checkTables(mobileLocales('locales'), { plurals: true, label: 'app' })).toEqual([]);
  });

  it('native permission texts match', () => {
    expect(checkTables(mobileLocales('native'), { plurals: false, label: 'native' })).toEqual([]);
  });

  it('detects missing keys, placeholders, empty values and plural forms', () => {
    const problems = checkTables(
      {
        et: { a: 'A {{x}}', b: 'B', 'n_one': '{{count}} koer', 'n_other': '{{count}} koera' },
        ru: { a: 'А {{y}}', b: '', 'n_one': '{{count}} собака', 'n_other': '{{count}} собаки' },
      },
      { plurals: true, label: 't' },
    );
    expect(problems).toEqual([
      't ru: "b" is empty',
      't ru: "a" has placeholders [y], et has [x]',
      't ru: "n" lacks plural forms few, many',
    ]);
  });
});

describe('translate', () => {
  it('fills params and falls back to the visible placeholder when one is missing', () => {
    expect(translate('et', 'errors.dogLimit', { max: 10 })).toBe('Kuni 10 koera kasutaja kohta');
    expect(translate('ru', 'errors.dogLimit', { max: 10 })).toBe('Не более 10 собак на пользователя');
    expect(translate('en', 'errors.dogLimit')).toBe('Up to {{max}} dogs per user');
  });
});

describe('fieldErrors in the app language', () => {
  const invalid = signUpInputSchema.safeParse({ name: 'M', email: 'not-an-email', password: '123' });

  it.each([
    ['et', { name: 'Vähemalt 2 märki', email: 'Sisesta korrektne e-posti aadress', password: 'Vähemalt 8 märki' }],
    ['en', { name: 'At least 2 characters', email: 'Enter a valid email address', password: 'At least 8 characters' }],
    ['ru', { name: 'Не менее 2 символов', email: 'Введите корректный адрес эл. почты', password: 'Не менее 8 символов' }],
  ] as const)('%s', (language, expected) => {
    expect(invalid.success).toBe(false);
    expect(fieldErrors(invalid.error!, language)).toEqual(expected);
  });

  it('defaults to Estonian and translates whole-form messages', () => {
    const empty = updateProfileInputSchema.safeParse({});
    expect(fieldErrors(empty.error!)).toEqual({ _: 'Muuda vähemalt üht välja' });
    expect(fieldErrors(empty.error!, 'en')).toEqual({ _: 'Change at least one field' });
  });
});
