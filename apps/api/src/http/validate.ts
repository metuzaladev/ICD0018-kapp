import { describeFirstIssue } from '@kapp/shared';
import type { z } from 'zod';

import { BadRequestError } from './errors';

/**
 * Validation for request parts. Routes call this first and only ever work with parsed data.
 *
 * Why not Fastify's built-in JSON-schema validation: the same Zod schemas are used by the
 * mobile app (packages/shared), so there is exactly one definition of what valid input is —
 * and one set of Estonian error texts (`describeFirstIssue`).
 */

type Part = 'body' | 'query' | 'params';

export function parseRequest<S extends z.ZodType>(schema: S, data: unknown, part: Part): z.infer<S> {
  // A POST without a body arrives as undefined (no Content-Type) — reject it explicitly
  // instead of letting it surface as a confusing "expected object" message.
  if (part === 'body' && (data === undefined || data === null)) {
    throw new BadRequestError('Päringu sisu puudub');
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestError(describeFirstIssue(result.error, part));
  }
  return result.data;
}
