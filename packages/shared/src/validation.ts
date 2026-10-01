import type { z } from 'zod';

import { DEFAULT_LANGUAGE, isLanguage, translate, type Language, type MessageKey, type MessageParams } from './i18n';
import { et } from './i18n/et';

/**
 * Turns Zod issues into short texts in the user's language (Estonian by default).
 * Why shared: the API uses it for `{ error, message }` and the app for inline field errors, so the
 * user sees the same wording whether a form is rejected on the device or by the server.
 *
 * Schemas set their own text with a `kapp:` prefixed message key, built with `issueMessage`
 * (e.g. `kapp:validation.minChars|{"min":8}`); everything else falls back to a generic text per
 * issue code. The key — not a finished sentence — travels in the issue, so each side translates it
 * into its own language at the last moment.
 */

const ISSUE_KEY: Record<string, MessageKey> = {
  invalid_type: 'validation.invalidType',
  too_small: 'validation.tooSmall',
  too_big: 'validation.tooBig',
  invalid_format: 'validation.invalidFormat',
  invalid_value: 'validation.invalidValue',
};

const CUSTOM_PREFIX = 'kapp:';
const PARAMS_SEPARATOR = '|';

type Issue = z.core.$ZodIssue;

/** Message for a schema rule: a translatable key plus params, encoded in the Zod message string. */
export function issueMessage(key: MessageKey, params?: MessageParams): string {
  return `${CUSTOM_PREFIX}${key}${params ? PARAMS_SEPARATOR + JSON.stringify(params) : ''}`;
}

/** Decodes `issueMessage`; null for Zod's own messages or a key that does not exist. */
export function parseIssueMessage(message: string): { key: MessageKey; params?: MessageParams } | null {
  if (!message.startsWith(CUSTOM_PREFIX)) return null;
  const body = message.slice(CUSTOM_PREFIX.length);
  const at = body.indexOf(PARAMS_SEPARATOR);
  const key = at === -1 ? body : body.slice(0, at);
  if (!(key in et)) return null;
  let params: MessageParams | undefined;
  if (at !== -1) {
    try {
      params = JSON.parse(body.slice(at + 1)) as MessageParams;
    } catch {
      params = undefined;
    }
  }
  return { key: key as MessageKey, params };
}

const lang = (language: Language | undefined): Language => (isLanguage(language) ? language : DEFAULT_LANGUAGE);

/** The predicate part without the field name, e.g. "on liiga lühike või väike". */
export function issueText(issue: Issue, language: Language = DEFAULT_LANGUAGE): string {
  const l = lang(language);
  const custom = parseIssueMessage(issue.message);
  if (custom) return translate(l, custom.key, custom.params);
  if (issue.code === 'unrecognized_keys') return translate(l, 'validation.unknownKeys', { keys: issue.keys.join(', ') });
  return translate(l, ISSUE_KEY[issue.code] ?? 'validation.invalid');
}

/** Upper-cases the first letter in the language's own rules (fine for Latin and Cyrillic). */
const capitalize = (s: string, language: Language) => s.charAt(0).toLocaleUpperCase(language) + s.slice(1);

/**
 * One sentence for the whole error, naming the field: `Väli "lat" on liiga pikk või suur`.
 * `fallbackField` names the part when the issue has no path (the API passes body/query/params).
 */
export function describeFirstIssue(error: z.ZodError, fallbackField?: string, language: Language = DEFAULT_LANGUAGE): string {
  const l = lang(language);
  const issue = error.issues[0];
  if (!issue) return translate(l, 'validation.invalidRequest');
  const custom = parseIssueMessage(issue.message) !== null;
  if (issue.code === 'unrecognized_keys') return capitalize(issueText(issue, l), l);
  if (issue.path.length === 0 && custom) return capitalize(issueText(issue, l), l);
  const field = issue.path.join('.') || fallbackField || translate(l, 'validation.request');
  return translate(l, custom ? 'validation.fieldCustom' : 'validation.fieldGeneric', { field, problem: issueText(issue, l) });
}

/** First message per top-level field, for showing errors under form inputs (`_` = whole form). */
export function fieldErrors(error: z.ZodError, language: Language = DEFAULT_LANGUAGE): Record<string, string> {
  const l = lang(language);
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!(key in result)) result[key] = capitalize(issueText(issue, l), l);
  }
  return result;
}
