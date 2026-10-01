import type { z } from 'zod';

import { BadRequestError } from './errors';

/**
 * Validation for request parts. Routes call these first and only ever work with parsed data.
 *
 * Why not Fastify's built-in JSON-schema validation: the same Zod schemas are used by the
 * mobile app (packages/shared), so there is exactly one definition of what valid input is.
 */

type Part = 'body' | 'query' | 'params';

const ISSUE_TEXT: Record<string, string> = {
  invalid_type: 'puudub või on vale tüüpi',
  too_small: 'on liiga lühike või väike',
  too_big: 'on liiga pikk või suur',
  invalid_format: 'on vales vormingus',
  invalid_value: 'ei ole lubatud väärtus',
};

/** Turns the first Zod issue into one user-readable sentence, e.g. `Väli "lat" on liiga pikk või suur`. */
export function describeIssue(error: z.ZodError, part: Part): string {
  const issue = error.issues[0];
  if (!issue) return 'Vigane päring';
  if (issue.code === 'unrecognized_keys') {
    return `Tundmatud väljad: ${issue.keys.join(', ')}`;
  }
  const field = issue.path.join('.') || part;
  return `Väli "${field}" ${ISSUE_TEXT[issue.code] ?? 'on vigane'}`;
}

export function parseRequest<S extends z.ZodType>(schema: S, data: unknown, part: Part): z.infer<S> {
  // A POST without a body arrives as undefined (no Content-Type) — reject it explicitly
  // instead of letting it surface as a confusing "expected object" message.
  if (part === 'body' && (data === undefined || data === null)) {
    throw new BadRequestError('Päringu sisu puudub');
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestError(describeIssue(result.error, part));
  }
  return result.data;
}
