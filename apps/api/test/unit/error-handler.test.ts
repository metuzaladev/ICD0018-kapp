import { describe, expect, it } from 'vitest';

import { toErrorResponse } from '../../src/http/error-handler';
import { ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError, UnauthorizedError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';

describe('toErrorResponse', () => {
  it('uses status and message of HttpError', () => {
    expect(toErrorResponse(new NotFoundError('errors.parkNotFound'))).toEqual({
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

  it('keeps the English text on the error for the server log', () => {
    expect(new NotFoundError('errors.parkNotFound').message).toBe('Park not found');
    expect(new ConflictError('errors.dogLimit', { max: 10 }).message).toBe('Up to 10 dogs per user');
  });
});

describe('toErrorResponse translations', () => {
  it.each([
    [new NotFoundError('errors.parkNotFound'), 404, 'Park not found', 'Парк не найден'],
    [new UnauthorizedError(), 401, 'Please sign in', 'Пожалуйста, войдите в аккаунт'],
    [new ForbiddenError('errors.reviewNeedsVisit'), 403, 'You can only review a park you have visited', 'Оценить можно только парк, в котором вы были'],
    [new ConflictError('errors.dogLimit', { max: 10 }), 409, 'Up to 10 dogs per user', 'Не более 10 собак на пользователя'],
    [new ServiceUnavailableError('errors.storageUnavailable'), 503, 'Photo storage is not responding, please try again in a moment', 'Хранилище фото не отвечает, попробуйте чуть позже'],
  ])('translates %s', (error, status, en, ru) => {
    expect(toErrorResponse(error, 'en')).toEqual({ status, body: { error: true, message: en } });
    expect(toErrorResponse(error, 'ru')).toEqual({ status, body: { error: true, message: ru } });
  });

  it.each([
    ['en', 'The service is not responding, please try again in a moment'],
    ['ru', 'Сервис не отвечает, попробуйте чуть позже'],
  ] as const)('translates a database outage into %s', (language, message) => {
    expect(toErrorResponse(new TimeoutError('parks.findById', 8000), language).body.message).toBe(message);
  });

  it.each([
    ['en', 'The request body is not valid JSON'],
    ['ru', 'Тело запроса не является корректным JSON'],
  ] as const)('translates Fastify parser errors into %s', (language, message) => {
    const error = Object.assign(new Error('x'), { code: 'FST_ERR_CTP_INVALID_JSON_BODY', statusCode: 400 });
    expect(toErrorResponse(error, language).body.message).toBe(message);
  });

  it.each([
    ['en', 'Server error, please try again later'],
    ['ru', 'Ошибка сервера, попробуйте позже'],
  ] as const)('translates unexpected errors into %s without details', (language, message) => {
    expect(toErrorResponse(new Error('secret=1'), language)).toEqual({ status: 500, body: { error: true, message } });
  });
});
