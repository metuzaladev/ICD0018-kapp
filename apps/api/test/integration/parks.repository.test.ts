/**
 * Runs the real SQL/PostGIS queries against the Docker database.
 * Opt-in (`npm run test:integration`) so the default unit suite stays hermetic and fast.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { parks, user } from '../../src/db/schema';
import { createParksRepository } from '../../src/modules/parks/parks.repository';

const TEST_USER = 'integration_test_user';
const repository = createParksRepository(db);
const created: string[] = [];

beforeAll(async () => {
  await db.insert(user).values({ id: TEST_USER, name: 'Test', email: 'integration@test.invalid' }).onConflictDoNothing();
});

afterAll(async () => {
  for (const id of created) await db.delete(parks).where(eq(parks.id, id));
  await db.delete(user).where(eq(user.id, TEST_USER));
  await pool.end();
});

describe('ParksRepository (PostGIS)', () => {
  it('creates a suggestion as pending with coordinates round-tripped', async () => {
    const park = await repository.create({
      name: 'Integratsioonitesti park',
      description: null,
      address: null,
      lat: 59.4,
      lng: 24.7,
      fenced: true,
      smallDogArea: false,
      water: false,
      lighting: false,
      createdBy: TEST_USER,
    });
    created.push(park.id);

    expect(park.status).toBe('pending');
    expect(park.lat).toBeCloseTo(59.4, 6);
    expect(park.lng).toBeCloseTo(24.7, 6);
    await expect(repository.findById(park.id)).resolves.toMatchObject({ id: park.id });
  });

  it('excludes pending parks from nearby results', async () => {
    const results = await repository.findApprovedNearby({ lat: 59.4, lng: 24.7 }, 1, 50);
    expect(results.map((r) => r.id)).not.toContain(created[0]);
  });

  it('returns null for an unknown id', async () => {
    await expect(repository.findById('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
  });

  it('orders nearby results by distance', async () => {
    const results = await repository.findApprovedNearby({ lat: 59.437, lng: 24.7536 }, 10, 50);
    const distances = results.map((r) => r.distanceKm ?? 0);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });
});
