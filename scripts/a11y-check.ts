/**
 * `npm run a11y:check` — static accessibility gate for apps/mobile/src, run in CI next to the
 * i18n check. The rules and their reasons are in a11y-rules.ts; how to test what a static check
 * cannot see (VoiceOver order, Dynamic Type, contrast) is in docs/14-animatsioonid-ja-ligipaasetavus.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkA11y } from './a11y-rules';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_SRC = join(ROOT, 'apps/mobile/src');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

const problems = tsxFiles(MOBILE_SRC).flatMap((file) =>
  checkA11y(file, readFileSync(file, 'utf8')).map((p) => `${relative(ROOT, file)}:${p.line}: ${p.message}`),
);

if (problems.length > 0) {
  console.error(`a11y check failed (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('a11y check passed: every touchable has a role and label, inputs are labelled, images are labelled or hidden.');
