import { afterAll, describe, expect, it, vi } from 'vitest';

// The app's i18n instance reads the device language at start-up; Node has no native module.
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'et-EE', languageCode: 'et' }] }));

import i18n from '@/i18n';
import { dogsLabel, formatAgo, formatList, formatNumber, friendsInParkLabel, pawsLabel, plannedVisitsLabel } from '@/lib/format';

/**
 * Counted nouns on the M9 map pins ("6 koera"), park cards ("3 sõpra pargis") and the Käpad badge
 * go through plural keys, never string concatenation. Russian needs one/few/many (1 собака,
 * 2 собаки, 5 собак, 21 собака); Estonian and English one/other.
 */
async function inLanguage(language: 'et' | 'en' | 'ru', run: () => void) {
  await i18n.changeLanguage(language);
  run();
}

describe('count labels', () => {
  afterAll(() => i18n.changeLanguage('et'));

  it('dog counts in Estonian, English and Russian', async () => {
    await inLanguage('et', () => {
      expect(dogsLabel(1)).toBe('1 koer');
      expect(dogsLabel(6)).toBe('6 koera');
    });
    await inLanguage('en', () => {
      expect(dogsLabel(1)).toBe('1 dog');
      expect(dogsLabel(3)).toBe('3 dogs');
    });
    await inLanguage('ru', () => {
      expect(dogsLabel(1)).toBe('1 собака');
      expect(dogsLabel(2)).toBe('2 собаки');
      expect(dogsLabel(5)).toBe('5 собак');
      expect(dogsLabel(11)).toBe('11 собак');
      expect(dogsLabel(21)).toBe('21 собака');
    });
  });

  it('friends in the park (Park Card)', async () => {
    await inLanguage('et', () => {
      expect(friendsInParkLabel(1)).toBe('1 sõber pargis');
      expect(friendsInParkLabel(3)).toBe('3 sõpra pargis');
    });
    await inLanguage('en', () => {
      expect(friendsInParkLabel(1)).toBe('1 friend in the park');
      expect(friendsInParkLabel(2)).toBe('2 friends in the park');
    });
    await inLanguage('ru', () => {
      expect(friendsInParkLabel(1)).toBe('1 друг в парке');
      expect(friendsInParkLabel(3)).toBe('3 друга в парке');
      expect(friendsInParkLabel(5)).toBe('5 друзей в парке');
    });
  });

  it('Käpad balance for VoiceOver', async () => {
    await inLanguage('et', () => expect(i18n.t('points.balance', { count: 320 })).toBe('320 käppa'));
    await inLanguage('ru', () => {
      expect(i18n.t('points.balance', { count: 1 })).toBe('1 лапка');
      expect(i18n.t('points.balance', { count: 3 })).toBe('3 лапки');
      expect(i18n.t('points.balance', { count: 320 })).toBe('320 лапок');
    });
  });

  it('formats whole numbers with the locale grouping', async () => {
    await inLanguage('en', () => expect(formatNumber(1200)).toBe('1,200'));
    // Estonian groups with a no-break space, and only from five digits (CLDR minimum grouping).
    await inLanguage('et', () => {
      expect(formatNumber(1200)).toBe('1200');
      expect(formatNumber(12000).replace(/\s/g, ' ')).toBe('12 000');
    });
  });

  it('paw amounts and "2 h tagasi" use plural keys (M9b)', async () => {
    const now = new Date('2026-10-02T12:00:00Z');
    await inLanguage('et', () => {
      expect(pawsLabel(1)).toBe('1 käpp');
      expect(pawsLabel(15)).toBe('15 käppa');
      expect(formatAgo('2026-10-02T10:00:00Z', now)).toBe('2 h tagasi');
      expect(formatAgo('2026-10-01T12:00:00Z', now)).toBe('1 päev tagasi');
      expect(formatAgo('2026-10-02T11:59:40Z', now)).toBe('just praegu');
    });
    await inLanguage('ru', () => {
      expect(pawsLabel(2)).toBe('2 лапки');
      expect(pawsLabel(25)).toBe('25 лапок');
      expect(formatAgo('2026-09-27T12:00:00Z', now)).toBe('5 дней назад');
    });
    await inLanguage('en', () => expect(formatAgo('2026-09-30T12:00:00Z', now)).toBe('2 days ago'));
  });

  it('M11: planned visits and friend name lists', async () => {
    await inLanguage('et', () => {
      expect(plannedVisitsLabel(1)).toBe('1 plaanitud külastus');
      expect(plannedVisitsLabel(4)).toBe('4 plaanitud külastust');
      expect(formatList([])).toBe('');
      expect(formatList(['Mari'])).toBe('Mari');
      expect(formatList(['Mari', 'Jaan'])).toBe('Mari ja Jaan');
      expect(formatList(['Mari', 'Jaan', 'Luna'])).toBe('Mari, Jaan ja Luna');
    });
    await inLanguage('ru', () => {
      expect(plannedVisitsLabel(1)).toBe('1 запланированный визит');
      expect(plannedVisitsLabel(3)).toBe('3 запланированных визита');
      expect(plannedVisitsLabel(5)).toBe('5 запланированных визитов');
      expect(formatList(['Мари', 'Яан'])).toBe('Мари и Яан');
    });
    await inLanguage('en', () => expect(formatList(['Mari', 'Jaan', 'Luna'])).toBe('Mari, Jaan and Luna'));
  });
});
