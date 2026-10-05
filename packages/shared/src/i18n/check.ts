import { placeholdersOf } from './index';

/**
 * Consistency checks for translation tables, shared by `npm run i18n:check` (scripts/i18n-check.ts)
 * and the API unit tests. Not exported from the package index: only tooling imports it.
 *
 * Rules:
 * - every language has the same keys (plural keys are compared by their base, see below);
 * - every value is a non-empty string;
 * - the same `{{param}}` placeholders appear in every language;
 * - plural keys (`key_one`, `key_few`, …) have exactly the forms Intl.PluralRules requires for the
 *   language (et/en: one, other; ru: one, few, many, other), plus an optional `_zero` that must
 *   then exist in every language.
 */

export type FlatTable = Record<string, string>;

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Nested JSON → `{ "auth.signIn.title": "…" }`. Non-string leaves are reported as problems. */
export function flatten(value: unknown, prefix = '', problems: string[] = []): FlatTable {
  const out: FlatTable = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${prefix || '(root)'}: expected an object`);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[path] = child;
    else if (typeof child === 'object' && child !== null && !Array.isArray(child)) Object.assign(out, flatten(child, path, problems));
    else problems.push(`${path}: expected a string or an object, got ${JSON.stringify(child)}`);
  }
  return out;
}

interface Entry {
  /** Key without the plural suffix. */
  base: string;
  /** Plural form, or null for an ordinary key. */
  form: string | null;
  value: string;
}

function entries(table: FlatTable, plurals: boolean): Entry[] {
  return Object.entries(table).map(([key, value]) => {
    const match = plurals ? PLURAL_SUFFIX.exec(key) : null;
    return { base: match ? key.slice(0, match.index) : key, form: match ? match[1]! : null, value };
  });
}

/**
 * Compares the tables of all languages. The first language is the reference (Estonian, the
 * source). Returns human-readable problems; an empty list means the tables are consistent.
 */
export function checkTables(tables: Record<string, FlatTable>, options: { plurals: boolean; label: string }): string[] {
  const problems: string[] = [];
  const languages = Object.keys(tables);
  const byLanguage = new Map<string, Map<string, Entry[]>>();

  for (const language of languages) {
    const grouped = new Map<string, Entry[]>();
    for (const entry of entries(tables[language]!, options.plurals)) {
      if (entry.value.trim() === '') problems.push(`${options.label} ${language}: "${entry.base}${entry.form ? `_${entry.form}` : ''}" is empty`);
      grouped.set(entry.base, [...(grouped.get(entry.base) ?? []), entry]);
    }
    byLanguage.set(language, grouped);
  }

  const allBases = new Set(languages.flatMap((l) => [...byLanguage.get(l)!.keys()]));
  for (const base of [...allBases].sort()) {
    const present = languages.filter((l) => byLanguage.get(l)!.has(base));
    for (const language of languages.filter((l) => !present.includes(l))) {
      problems.push(`${options.label} ${language}: missing "${base}" (present in ${present.join(', ')})`);
    }
    if (present.length < 2) continue;

    // Plural forms.
    const isPlural = present.some((l) => byLanguage.get(l)!.get(base)!.some((e) => e.form !== null));
    if (isPlural) {
      const hasZero = present.filter((l) => byLanguage.get(l)!.get(base)!.some((e) => e.form === 'zero'));
      if (hasZero.length > 0 && hasZero.length < present.length) {
        problems.push(`${options.label}: "${base}_zero" exists only in ${hasZero.join(', ')}`);
      }
      for (const language of present) {
        const group = byLanguage.get(language)!.get(base)!;
        if (group.some((e) => e.form === null)) {
          problems.push(`${options.label} ${language}: "${base}" is both a plain and a plural key`);
          continue;
        }
        const required = new Intl.PluralRules(language).resolvedOptions().pluralCategories as string[];
        const forms = group.map((e) => e.form!).filter((f) => f !== 'zero');
        const missing = required.filter((f) => !forms.includes(f));
        const extra = forms.filter((f) => !required.includes(f));
        if (missing.length) problems.push(`${options.label} ${language}: "${base}" lacks plural forms ${missing.join(', ')}`);
        if (extra.length) problems.push(`${options.label} ${language}: "${base}" has forms ${extra.join(', ')} that ${language} does not use`);
      }
    }

    // Placeholders: the union over a key's forms must be identical in every language.
    const placeholders = (language: string) =>
      [...new Set(byLanguage.get(language)!.get(base)!.flatMap((e) => placeholdersOf(e.value)))].sort().join(', ');
    const reference = placeholders(present[0]!);
    for (const language of present.slice(1)) {
      const own = placeholders(language);
      if (own !== reference) {
        problems.push(`${options.label} ${language}: "${base}" has placeholders [${own}], ${present[0]} has [${reference}]`);
      }
    }
  }
  return problems;
}
