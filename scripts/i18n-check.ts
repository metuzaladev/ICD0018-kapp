/**
 * `npm run i18n:check` — translation quality gates (docs/11-tolked-ja-figma.md), run in CI.
 *
 * 1. The app's locale files (apps/mobile/src/i18n/locales/{et,en,ru}.json), the native permission
 *    texts (apps/mobile/src/i18n/native/*.json) and the shared message tables
 *    (packages/shared/src/i18n/{et,en,ru}.ts) have the same keys, the same {{param}} placeholders,
 *    the plural forms each language needs, and no empty values.
 * 2. No user-visible text is hard-coded in apps/mobile/src outside src/i18n:
 *    - no string literal or JSX text with Estonian letters (õäöüšž) or Cyrillic;
 *    - no JSX text with letters at all (every visible text goes through t());
 *    - no letter-containing string literal in a user-facing prop or option
 *      (title, label, placeholder, accessibilityLabel, Alert button `text`, …).
 *    Exceptions are listed in ALLOWED (brand name, map attribution).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { MESSAGES } from '../packages/shared/src/i18n';
import { checkTables, flatten, type FlatTable } from '../packages/shared/src/i18n/check';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_SRC = join(ROOT, 'apps/mobile/src');
const LANGUAGES = ['et', 'en', 'ru'] as const;

/** Visible texts that are the same in every language. */
const ALLOWED = new Set(['käpp', '© OpenStreetMap']);

/** Props / object keys whose string value is shown to (or read out for) the user. */
const USER_FACING_PROPS = new Set([
  'title',
  'subtitle',
  'headerTitle',
  'label',
  'placeholder',
  'message',
  'text',
  'accessibilityLabel',
  'accessibilityHint',
]);

const NATIONAL_LETTERS = /[õäöüšžÕÄÖÜŠŽЀ-ӿ]/;
const ANY_LETTER = /\p{L}/u;
/** A translation key such as 'health.vaccinations' (passed to t() later) is not visible text. */
const TRANSLATION_KEY = /^[a-z][A-Za-z]*(\.[A-Za-z_]+)+$/;

const problems: string[] = [];

/* ---------- 1. table consistency ---------- */

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function tablesFrom(dir: string, label: string): Record<string, FlatTable> {
  const tables: Record<string, FlatTable> = {};
  for (const language of LANGUAGES) {
    const flatProblems: string[] = [];
    tables[language] = flatten(readJson(join(dir, `${language}.json`)), '', flatProblems);
    problems.push(...flatProblems.map((p) => `${label} ${language}: ${p}`));
  }
  return tables;
}

problems.push(...checkTables(tablesFrom(join(MOBILE_SRC, 'i18n/locales'), 'app locales'), { plurals: true, label: 'app locales' }));
problems.push(...checkTables(tablesFrom(join(MOBILE_SRC, 'i18n/native'), 'native locales'), { plurals: false, label: 'native locales' }));
problems.push(
  ...checkTables(Object.fromEntries(LANGUAGES.map((l) => [l, { ...MESSAGES[l] }])), { plurals: false, label: 'shared messages' }),
);

/* ---------- 2. hard-coded strings ---------- */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === join(MOBILE_SRC, 'i18n') ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Name of the prop or object key a string literal is the value of, if any. */
function ownerName(node: ts.Node): string | null {
  const parent = node.parent;
  if (ts.isJsxAttribute(parent)) return parent.name.getText();
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) return parent.parent.name.getText();
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) return parent.name.getText().replace(/['"]/g, '');
  return null;
}

for (const file of sourceFiles(MOBILE_SRC)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const report = (node: ts.Node, value: string, why: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    problems.push(`${relative(ROOT, file)}:${line + 1}: ${why}: ${JSON.stringify(value.trim())}`);
  };

  const visit = (node: ts.Node) => {
    // Module specifiers ('@/i18n') are code, not text.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;

    if (ts.isJsxText(node)) {
      const value = node.getText(source).trim();
      if (value && !ALLOWED.has(value) && ANY_LETTER.test(value)) report(node, value, 'JSX text not translated');
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const value = node.text;
      if (!ALLOWED.has(value.trim())) {
        if (NATIONAL_LETTERS.test(value)) report(node, value, 'Estonian or Russian text in code');
        else if (ANY_LETTER.test(value) && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
          const owner = ownerName(node);
          if (owner && USER_FACING_PROPS.has(owner) && !TRANSLATION_KEY.test(value)) report(node, value, `literal in "${owner}"`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

/* ---------- result ---------- */

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('i18n check passed: app, native and shared tables match; no hard-coded UI text in apps/mobile/src.');
