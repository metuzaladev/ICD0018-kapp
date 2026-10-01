import type { Park } from '@kapp/shared';
import { vi } from 'vitest';

import { buildApp, defaultAppConfig, type AppConfig, type AppDeps } from '../src/app';
import type { ParkRecord, ParksRepository } from '../src/modules/parks/parks.repository';
import type { ParksService } from '../src/modules/parks/parks.service';

export const PARK_ID = '4ddabe8d-7306-4724-a125-ace7ae3a87b9';
export const USER_ID = 'user_test_1';

export function makeParkRecord(overrides: Partial<ParkRecord> = {}): ParkRecord {
  return {
    id: PARK_ID,
    name: 'Kadrioru koerapark',
    description: null,
    address: 'Kadriorg, Tallinn',
    lat: 59.4389,
    lng: 24.7925,
    fenced: true,
    smallDogArea: true,
    water: true,
    lighting: true,
    status: 'approved',
    ...overrides,
  };
}

export function makePark(overrides: Partial<Park> = {}): Park {
  return { ...makeParkRecord(), ...overrides };
}

export function mockRepository(): { [K in keyof ParksRepository]: ReturnType<typeof vi.fn> } & ParksRepository {
  return {
    findApprovedNearby: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  } as never;
}

export function mockService(): { [K in keyof ParksService]: ReturnType<typeof vi.fn> } & ParksService {
  return {
    listNearby: vi.fn().mockResolvedValue([]),
    getPublicPark: vi.fn().mockResolvedValue(makePark()),
    suggestPark: vi.fn().mockResolvedValue(makePark({ status: 'pending' })),
  } as never;
}

/** App with mocked dependencies — no database, no network. */
export async function buildTestApp(deps: Partial<AppDeps> = {}, config: Partial<AppConfig> = {}) {
  const service = (deps.parksService as ReturnType<typeof mockService> | undefined) ?? mockService();
  const app = await buildApp(
    {
      parksService: service,
      checkDatabase: deps.checkDatabase ?? (async () => true),
      resolveUserId: deps.resolveUserId,
    },
    { ...defaultAppConfig, ...config },
  );
  return { app, service };
}

/** Resolver that treats `Authorization: Bearer test` as USER_ID — stands in for Better Auth. */
export const fakeAuth: AppDeps['resolveUserId'] = async (request) =>
  request.headers.authorization === 'Bearer test' ? USER_ID : null;
