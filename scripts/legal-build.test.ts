import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LEGAL_DOCUMENTS, LEGAL_VERSIONS, legalBlocks, legalMarkdown, parseLegalMarkdown } from '../packages/shared/src/legal';
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

describe('parseLegalMarkdown (shared by the API page and the app screen)', () => {
  it('parses headings, joined paragraph lines, lists, bold and safe links only', () => {
    const blocks = parseLegalMarkdown(
      '# Title\n\nFirst line\nsecond line with **bold**.\n\n- item [AKI](https://www.aki.ee)\n- [mail](mailto:a@b.ee) and [bad](javascript:alert(1))\n\n## Sub',
    );
    expect(blocks).toEqual([
      { type: 'heading', level: 1, content: [{ text: 'Title' }] },
      { type: 'paragraph', content: [{ text: 'First line second line with ' }, { text: 'bold', bold: true }, { text: '.' }] },
      {
        type: 'list',
        items: [
          [{ text: 'item ' }, { text: 'AKI', href: 'https://www.aki.ee' }],
          [{ text: 'mail', href: 'mailto:a@b.ee' }, { text: ' and ' }, { text: 'bad' }, { text: ')' }],
        ],
      },
      { type: 'heading', level: 2, content: [{ text: 'Sub' }] },
    ]);
  });

  it('keeps raw HTML as text (the renderers escape it)', () => {
    expect(parseLegalMarkdown('<script>x</script>')).toEqual([{ type: 'paragraph', content: [{ text: '<script>x</script>' }] }]);
  });
});
