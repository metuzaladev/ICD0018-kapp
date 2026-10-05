import { createParkInputSchema, parkIdParamsSchema, signUpInputSchema, type Language } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

import { BadRequestError, HttpError } from '../../src/http/errors';
import { parseRequest } from '../../src/http/validate';

const validPark = { name: 'Uus park', lat: 59.4, lng: 24.7 };

/** The user-facing text parseRequest's error produces in a language (Estonian unless asked). */
function rejection(run: () => unknown, language: Language = 'et'): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestError);
    return (error as HttpError).localize(language);
  }
  throw new Error('expected parseRequest to throw');
}

describe('parseRequest', () => {
  it('returns parsed data with defaults and normalised optional text', () => {
    const parsed = parseRequest(createParkInputSchema, { ...validPark, name: '  Uus park  ', description: '' }, 'body');
    expect(parsed).toEqual({
      name: 'Uus park',
      description: null,
      address: null,
      lat: 59.4,
      lng: 24.7,
      fenced: false,
      smallDogArea: false,
      water: false,
      lighting: false,
    });
  });

  it.each([undefined, null])('rejects a missing body (%s)', (body) => {
    expect(rejection(() => parseRequest(createParkInputSchema, body, 'body'))).toBe('Päringu sisu puudub');
  });

  it('names the field when a required value is null', () => {
    expect(rejection(() => parseRequest(createParkInputSchema, { ...validPark, name: null }, 'body'))).toBe(
      'Väli "name" puudub või on vale tüüpi',
    );
  });

  it('does not coerce body types (a string latitude is rejected)', () => {
    expect(rejection(() => parseRequest(createParkInputSchema, { ...validPark, lat: '59.4' }, 'body'))).toContain('Väli "lat"');
  });

  it('rejects unknown fields so server-owned columns cannot be set', () => {
    expect(rejection(() => parseRequest(createParkInputSchema, { ...validPark, status: 'approved' }, 'body'))).toBe(
      'Tundmatud väljad: status',
    );
  });

  it('rejects out-of-range coordinates', () => {
    expect(rejection(() => parseRequest(createParkInputSchema, { ...validPark, lat: 91 }, 'body'))).toBe(
      'Väli "lat" on liiga pikk või suur',
    );
  });

  it('rejects an id that is not a UUID', () => {
    expect(rejection(() => parseRequest(parkIdParamsSchema, { parkId: '123' }, 'params'))).toBe('Väli "parkId" on vales vormingus');
  });

  it('keeps the server log message in English', () => {
    expect(() => parseRequest(parkIdParamsSchema, { parkId: '123' }, 'params')).toThrow('Field "parkId" has an invalid format');
  });

  describe('in other languages', () => {
    it.each([
      ['en', 'Field "parkId" has an invalid format'],
      ['ru', 'Поле "parkId" в неверном формате'],
    ] as const)('describes a generic issue in %s', (language, text) => {
      expect(rejection(() => parseRequest(parkIdParamsSchema, { parkId: '123' }, 'params'), language)).toBe(text);
    });

    it.each([
      ['en', 'Field "password": at least 8 characters'],
      ['ru', 'Поле "password": не менее 8 символов'],
    ] as const)('translates a schema message with params in %s', (language, text) => {
      const body = { name: 'Mari', email: 'mari@example.com', password: 'short' };
      expect(rejection(() => parseRequest(signUpInputSchema, body, 'body'), language)).toBe(text);
    });

    it.each([
      ['en', 'Unknown fields: status'],
      ['ru', 'Неизвестные поля: status'],
    ] as const)('lists unknown fields in %s', (language, text) => {
      expect(rejection(() => parseRequest(createParkInputSchema, { ...validPark, status: 'approved' }, 'body'), language)).toBe(text);
    });

    it.each([
      ['en', 'The request body is missing'],
      ['ru', 'Тело запроса отсутствует'],
    ] as const)('reports a missing body in %s', (language, text) => {
      expect(rejection(() => parseRequest(createParkInputSchema, undefined, 'body'), language)).toBe(text);
    });
  });
});
