import { createParkInputSchema, parkIdParamsSchema } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

import { BadRequestError } from '../../src/http/errors';
import { parseRequest } from '../../src/http/validate';

const validPark = { name: 'Uus park', lat: 59.4, lng: 24.7 };

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
    expect(() => parseRequest(createParkInputSchema, body, 'body')).toThrow(
      new BadRequestError('Päringu sisu puudub'),
    );
  });

  it('names the field when a required value is null', () => {
    expect(() => parseRequest(createParkInputSchema, { ...validPark, name: null }, 'body')).toThrow(
      'Väli "name" puudub või on vale tüüpi',
    );
  });

  it('does not coerce body types (a string latitude is rejected)', () => {
    expect(() => parseRequest(createParkInputSchema, { ...validPark, lat: '59.4' }, 'body')).toThrow('Väli "lat"');
  });

  it('rejects unknown fields so server-owned columns cannot be set', () => {
    expect(() => parseRequest(createParkInputSchema, { ...validPark, status: 'approved' }, 'body')).toThrow(
      'Tundmatud väljad: status',
    );
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => parseRequest(createParkInputSchema, { ...validPark, lat: 91 }, 'body')).toThrow(
      'Väli "lat" on liiga pikk või suur',
    );
  });

  it('rejects an id that is not a UUID', () => {
    expect(() => parseRequest(parkIdParamsSchema, { parkId: '123' }, 'params')).toThrow(
      'Väli "parkId" on vales vormingus',
    );
  });
});
