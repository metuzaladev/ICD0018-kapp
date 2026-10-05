import { fieldErrors } from '@kapp/shared';
import type { z } from 'zod';

/**
 * Validates form values on the device with the same schema the API uses, so most mistakes are
 * caught without a round trip — the server still validates again (never trust the client).
 */
export function validateForm<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { data: z.infer<S>; errors: null } | { data: null; errors: Record<string, string> } {
  const result = schema.safeParse(values);
  return result.success ? { data: result.data, errors: null } : { data: null, errors: fieldErrors(result.error) };
}
