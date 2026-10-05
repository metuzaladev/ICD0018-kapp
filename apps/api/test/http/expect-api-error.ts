import { expect } from 'vitest';

/** Asserts the response body is exactly the standard `{ error: true, message }` shape. */
export function expectApiError(res: { json: () => unknown }, message?: string | RegExp) {
  const body = res.json() as { error: unknown; message: unknown };
  expect(Object.keys(body).sort()).toEqual(['error', 'message']);
  expect(body.error).toBe(true);
  expect(typeof body.message).toBe('string');
  if (message) expect(body.message).toMatch(message);
}
