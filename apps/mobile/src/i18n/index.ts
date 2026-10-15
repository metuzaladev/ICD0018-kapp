import { DEFAULT_LANGUAGE, LANGUAGES, matchLanguage, type Language } from '@kapp/shared';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import et from './locales/et.json';
import ru from './locales/ru.json';

/**
 * UI translations (docs/11-tolked-ja-figma.md).
 *
 * Why i18next + react-i18next: plural forms come from Intl.PluralRules (Russian needs
 * one/few/many, Estonian and English one/other), `useTranslation` re-renders screens when the
 * language changes, and keys are type-checked against et.json (i18next.d.ts).
 * Estonian is the source language and the fallback for a missing key.
 */

const resources = {
  et: { translation: et },
  en: { translation: en },
  ru: { translation: ru },
} as const;

/** BCP 47 tags for Intl: en-GB for a 24-hour clock and day-month order, as in Estonia. */
const LOCALE_TAG: Record<Language, string> = { et: 'et-EE', en: 'en-GB', ru: 'ru-RU' };

/** The first language in the device's preference list that the app supports, else Estonian. */
export function deviceLanguage(): Language {
  for (const locale of getLocales()) {
    const language = matchLanguage(locale.languageTag) ?? matchLanguage(locale.languageCode);
    if (language) return language;
  }
  return DEFAULT_LANGUAGE;
}

/** A dedicated instance; `initReactI18next` hands it to `useTranslation` in every screen. */
const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGES,
  // React already escapes text; i18next escaping would show "&amp;".
  interpolation: { escapeValue: false },
  returnNull: false,
  // Resources are bundled, so initialisation is synchronous and the first render is translated.
  initAsync: false,
});

/** The language currently shown — for Intl formatting, Accept-Language and shared validation texts. */
export function currentLanguage(): Language {
  return matchLanguage(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LANGUAGE;
}

export function currentLocaleTag(): string {
  return LOCALE_TAG[currentLanguage()];
}

export default i18n;
