import { describeFirstIssue, type Language } from '@kapp/shared';
import type { z } from 'zod';

import { BadRequestError } from './errors';

/**
 * Validation for request parts. Routes call this first and only ever work with parsed data.
 *
 * Why not Fastify's built-in JSON-schema validation: the same Zod schemas are used by the
 * mobile app (packages/shared), so there is exactly one definition of what valid input is —
 * and one set of error texts in three languages (`describeFirstIssue`).
 */

type Part = 'body' | 'query' | 'params';

/**
 * 400 for invalid input. Keeps the Zod error and describes it in the request's language only when
 * the error handler asks (`localize`), because the route does not know the language.
 */
export class ValidationError extends BadRequestError {
  constructor(
    private readonly zodError: z.ZodError,
    private readonly part: Part,
  ) {
    super('errors.badRequest');
    this.message = describeFirstIssue(zodError, part, 'en');
  }

  override localize(language: Language): string {
    return describeFirstIssue(this.zodError, this.part, language);
  }
}

export function parseRequest<S extends z.ZodType>(schema: S, data: unknown, part: Part): z.infer<S> {
  // A POST without a body arrives as undefined (no Content-Type) — reject it explicitly
  // instead of letting it surface as a confusing "expected object" message.
  if (part === 'body' && (data === undefined || data === null)) {
    throw new BadRequestError('errors.bodyMissing');
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error, part);
  }
  return result.data;
}
