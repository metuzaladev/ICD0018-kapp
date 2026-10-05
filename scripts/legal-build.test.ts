import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LEGAL_DOCUMENTS, LEGAL_VERSIONS, legalBlocks, legalMarkdown } from '../packages/shared/src/legal';
import { buildLegalModule, GENERATED_PATH } from './legal-build';

describe('legal texts (docs/17)', () => {
  it('content.generated.ts matches the Markdown sources — run `npm run legal:build`', () => {
    expect(readFileSync(GENERATED_PATH, 'utf8')).toBe(buildLegalModule());
  });

  for (const doc of LEGAL_DOCUMENTS) {
    for (const lang of ['et', 'en', 'ru'] as const) {
      it(`${doc}.${lang} names its version and has the same section structure as Estonian`, () => {
        expect(legalMarkdown(doc, lang)).toContain(LEGAL_VERSIONS[doc]);
        const headings = (l: 'et' | 'en' | 'ru') => legalBlocks(doc, l).filter((b) => b.type === 'heading').length;
        expect(headings(lang)).toBe(headings('et'));
      });
    }
  }
});
