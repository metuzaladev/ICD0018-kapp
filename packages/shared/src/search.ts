import { z } from 'zod';

import { issueMessage } from './validation';

/**
 * Map search (GET /api/v1/search, docs/19): suggestions while typing in the Kaart search field.
 * One list mixes the app's own places (dog parks, service providers, community picks) and Estonian
 * addresses from the Land Board's In-ADS gazetteer, so "Kadriorg", "Kotzebue 9" and "Käpakoda" all
 * work from the same field. Choosing a result moves the map there.
 */

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
/** Per group: enough to choose from without pushing the map off the screen. */
export const SEARCH_LOCAL_LIMIT = 5;
export const SEARCH_ADDRESS_LIMIT = 4;

export const searchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(SEARCH_MIN_LENGTH, issueMessage('validation.searchTooShort', { min: SEARCH_MIN_LENGTH }))
      .max(SEARCH_MAX_LENGTH, issueMessage('validation.searchTooLong', { max: SEARCH_MAX_LENGTH })),
    /** Optional sort origin (the map centre or the user): closer places first. */
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), { path: ['lat'], message: issueMessage('validation.searchOrigin') });
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** What a result points at. `address` comes from In-ADS and has no id in the app. */
export const SEARCH_RESULT_KINDS = ['park', 'provider', 'post', 'address'] as const;
export type SearchResultKind = (typeof SEARCH_RESULT_KINDS)[number];

export const searchResultSchema = z.object({
  kind: z.enum(SEARCH_RESULT_KINDS),
  /** App id for park / provider / post; null for addresses. */
  id: z.string().nullable(),
  name: z.string(),
  /** Second line: park address, provider area, post category or the address's municipality. */
  subtitle: z.string().nullable(),
  /** Park: `park` or `beach` (swimming spot); provider: its category; post: its category; address: its type. */
  category: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  /** Camera zoom that frames the result: a house is closer than a town. */
  zoom: z.number(),
  distanceKm: z.number().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  /** False when the address service did not answer in time: the app says addresses are missing. */
  addressesAvailable: z.boolean(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
