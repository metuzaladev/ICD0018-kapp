import 'i18next';

import type et from './locales/et.json';

/** Type-checks every `t('…')` key against the Estonian source file. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof et };
  }
}
