import { describe, expect, it } from 'vitest';

import { toErrorResponse } from '../../src/http/error-handler';
import { NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';

describe('toErrorResponse', () => {
  it('uses status and message of HttpError', () => {
    expect(toErrorResponse(new NotFoundError('Parki ei leitud'))).toEqual({
      status: 404,
      body: { error: true, message: 'Parki ei leitud' },
    });
  });

  it('maps a service timeout to 503', () => {
    expect(toErrorResponse(new TimeoutError('parks.findById', 8000)).status).toBe(503);
  });

  it('maps a Postgres statement timeout wrapped by Drizzle to 503', () => {
    const driverError = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    const wrapped = new Error('Failed query: select …', { cause: driverError });
    expect(toErrorResponse(wrapped).status).toBe(503);
  });

  it('maps a refused database connection to 503', () => {
    expect(toErrorResponse(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })).status).toBe(503);
  });

  it.each([
    ['FST_ERR_CTP_EMPTY_JSON_BODY', 400, 'Päringu sisu puudub'],
    ['FST_ERR_CTP_INVALID_JSON_BODY', 400, 'Päringu sisu ei ole korrektne JSON'],
    ['FST_ERR_CTP_INVALID_MEDIA_TYPE', 415, 'Toetatud on ainult application/json'],
    ['FST_ERR_CTP_BODY_TOO_LARGE', 413, 'Päringu sisu on liiga suur'],
  ])('translates Fastify %s', (code, status, message) => {
    expect(toErrorResponse(Object.assign(new Error('x'), { code, statusCode: status }))).toEqual({
      status,
      body: { error: true, message },
    });
  });

  it('never leaks details of unexpected errors', () => {
    const result = toErrorResponse(new Error('relation "user" password=hunter2 does not exist'));
    expect(result.status).toBe(500);
    expect(result.body.message).not.toMatch(/hunter2|relation/);
  });

  it('handles non-Error throwables', () => {
    expect(toErrorResponse('string thrown').status).toBe(500);
    expect(toErrorResponse(null).status).toBe(500);
  });
});
