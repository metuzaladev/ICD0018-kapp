/**
 * Development seed: a handful of Tallinn dog parks so the map and "nearby" query have data.
 * Names are real areas, coordinates are approximate — sample data, not a verified park registry.
 */
import { inArray } from 'drizzle-orm';

import { db, pool } from './client';
import { parks } from './schema';

const samples = [
  { name: 'Kadrioru koerapark', address: 'Kadriorg, Tallinn', x: 24.7925, y: 59.4389, fenced: true, smallDogArea: true, water: true, lighting: true },
  { name: 'Stroomi koerapark', address: 'Pelguranna, Tallinn', x: 24.687, y: 59.446, fenced: true, smallDogArea: false, water: true, lighting: false },
  { name: 'Nõmme koerapark', address: 'Nõmme, Tallinn', x: 24.683, y: 59.383, fenced: true, smallDogArea: true, water: false, lighting: true },
  { name: 'Mustamäe koerapark', address: 'Mustamäe, Tallinn', x: 24.69, y: 59.408, fenced: true, smallDogArea: false, water: false, lighting: true },
  { name: 'Lasnamäe koerapark', address: 'Lasnamäe, Tallinn', x: 24.848, y: 59.433, fenced: true, smallDogArea: true, water: true, lighting: true },
  { name: 'Pirita koerapark', address: 'Pirita, Tallinn', x: 24.834, y: 59.468, fenced: false, smallDogArea: false, water: false, lighting: false },
];

await db.delete(parks).where(inArray(parks.name, samples.map((s) => s.name)));
await db.insert(parks).values(
  samples.map(({ x, y, ...rest }) => ({ ...rest, location: { x, y }, status: 'approved' as const })),
);
console.log(`Seeded ${samples.length} parks`);
await pool.end();
