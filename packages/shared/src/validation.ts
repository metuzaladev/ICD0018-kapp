import type { z } from 'zod';

/**
 * Turns Zod issues into short Estonian texts.
 * Why shared: the API uses it for `{ error, message }` and the app for inline field errors, so the
 * user sees the same wording whether a form is rejected on the device or by the server.
 *
 * Schemas can set their own text with a `kapp:` prefixed message (e.g. "kapp:vähemalt 8 märki");
 * everything else falls back to a generic text per issue code.
 */

const ISSUE_TEXT: Record<string, string> = {
  invalid_type: 'puudub või on vale tüüpi',
  too_small: 'on liiga lühike või väike',
  too_big: 'on liiga pikk või suur',
  invalid_format: 'on vales vormingus',
  invalid_value: 'ei ole lubatud väärtus',
};

const CUSTOM_PREFIX = 'kapp:';

type Issue = z.core.$ZodIssue;

/** The predicate part without the field name, e.g. "on liiga lühike või väike". */
export function issueText(issue: Issue): string {
  if (issue.message.startsWith(CUSTOM_PREFIX)) return issue.message.slice(CUSTOM_PREFIX.length);
  if (issue.code === 'unrecognized_keys') return `tundmatud väljad: ${issue.keys.join(', ')}`;
  return ISSUE_TEXT[issue.code] ?? 'on vigane';
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One sentence for the whole error, naming the field: `Väli "lat" on liiga pikk või suur`. */
export function describeFirstIssue(error: z.ZodError, fallbackField = 'päring'): string {
  const issue = error.issues[0];
  if (!issue) return 'Vigane päring';
  if (issue.code === 'unrecognized_keys') return capitalize(issueText(issue));
  if (issue.path.length === 0 && issue.message.startsWith(CUSTOM_PREFIX)) return capitalize(issueText(issue));
  const field = issue.path.join('.') || fallbackField;
  return `Väli "${field}" ${issueText(issue)}`;
}

/** First message per top-level field, for showing errors under form inputs (`_` = whole form). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!(key in result)) result[key] = capitalize(issueText(issue));
  }
  return result;
}
