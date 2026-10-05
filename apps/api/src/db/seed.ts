/**
 * Development seed: a handful of Tallinn dog parks so the map and "nearby" query have data, and
 * (M6) fictional dog service providers so the booking flow can be tried end to end.
 * Park names are real areas with approximate coordinates — sample data, not a verified registry.
 * Providers are invented (the app says so on the Services screen); any likeness to a real business
 * name is unintended.
 */
import { inArray } from 'drizzle-orm';

import { db, pool } from './client';
import { parks, providerHours, serviceProviders, services } from './schema';

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

/* ---------- M6: service providers ---------- */

type Hours = [weekday: number, opens: string, closes: string][];
const weekdays = (from: number, to: number, opens: string, closes: string): Hours =>
  Array.from({ length: to - from + 1 }, (_, i) => [from + i, opens, closes]);

const providers: {
  name: string;
  category: 'grooming' | 'training' | 'vet';
  tagline: string;
  description: string;
  area: string;
  address: string;
  x: number;
  y: number;
  ratingAverage: number;
  ratingCount: number;
  hours: Hours;
  services: { name: string; description?: string; durationMinutes: number; priceCents: number; priceIsFrom?: boolean }[];
}[] = [
  {
    // Figma "Service / Groomer".
    name: 'Käpakoda',
    category: 'grooming',
    tagline: 'Rahulik hoolitsus',
    description: 'Pesu, kammimine ja küünte lõikus. Tutvume iga koeraga tema tempos.',
    area: 'Kadriorg',
    address: 'Koidula 24, Tallinn',
    x: 24.7895,
    y: 59.4372,
    ratingAverage: 4.9,
    ratingCount: 87,
    hours: weekdays(2, 6, '10:00', '18:00'),
    services: [
      { name: 'Pesu ja kammimine', description: 'Šampoon, föönitamine ja põhjalik kammimine.', durationMinutes: 60, priceCents: 3500, priceIsFrom: true },
      { name: 'Küünte lõikus', durationMinutes: 15, priceCents: 1200 },
      { name: 'Täishooldus', description: 'Pesu, trimmimine, küüned ja kõrvad.', durationMinutes: 120, priceCents: 6500, priceIsFrom: true },
    ],
  },
  {
    name: 'Kalamaja Karvastuudio',
    category: 'grooming',
    tagline: 'Kiire pesu linnakoerale',
    description: 'Väike stuudio väikestele ja keskmistele koertele. Üks koer korraga, ilma ootamiseta.',
    area: 'Kalamaja',
    address: 'Kotzebue 16, Tallinn',
    x: 24.7311,
    y: 59.4467,
    ratingAverage: 4.7,
    ratingCount: 41,
    hours: weekdays(1, 5, '09:00', '17:00'),
    services: [
      { name: 'Ekspresspesu', durationMinutes: 45, priceCents: 2800 },
      { name: 'Trimmimine', durationMinutes: 90, priceCents: 5500, priceIsFrom: true },
    ],
  },
  {
    name: 'Hea Kutsu koerakool',
    category: 'training',
    tagline: 'Õpime koos, mitte käsu peale',
    description: 'Positiivse kinnistamise treeningud kutsikatele ja täiskasvanud koertele. Esimene tund on tutvumiseks.',
    area: 'Nõmme',
    address: 'Pärnu mnt 386, Tallinn',
    x: 24.6835,
    y: 59.3866,
    ratingAverage: 4.8,
    ratingCount: 63,
    hours: [[1, '16:00', '20:00'], [3, '16:00', '20:00'], [5, '16:00', '20:00'], [6, '10:00', '14:00']],
    services: [
      { name: 'Kutsikakool', description: 'Põhitõed 3–6 kuu vanustele kutsikatele.', durationMinutes: 60, priceCents: 2500 },
      { name: 'Individuaaltund', durationMinutes: 60, priceCents: 4000 },
      { name: 'Rihmaga kõndimise trenn', durationMinutes: 45, priceCents: 3000 },
    ],
  },
  {
    name: 'Pirita agility',
    category: 'training',
    tagline: 'Liikumisrõõm igas vanuses',
    description: 'Agility proovitunnid ja nõuanded aktiivsetele koertele mere ääres.',
    area: 'Pirita',
    address: 'Merivälja tee 5, Tallinn',
    x: 24.8384,
    y: 59.4687,
    ratingAverage: 4.6,
    ratingCount: 22,
    hours: [[6, '10:00', '16:00'], [7, '10:00', '16:00']],
    services: [{ name: 'Agility proovitund', durationMinutes: 60, priceCents: 2000 }],
  },
  {
    name: 'Saba ja Sõbrad loomakliinik',
    category: 'vet',
    tagline: 'Rahulik visiit, selged vastused',
    description: 'Üldkontrollid, vaktsineerimised ja nõustamine. Kiireloomulise mure korral helista kliinikusse.',
    area: 'Mustamäe',
    address: 'Sõpruse pst 200, Tallinn',
    x: 24.6857,
    y: 59.4095,
    ratingAverage: 4.8,
    ratingCount: 154,
    // Lunch break 13–14: two windows per weekday.
    hours: [...weekdays(1, 5, '09:00', '13:00'), ...weekdays(1, 5, '14:00', '19:00'), [6, '10:00', '14:00']],
    services: [
      { name: 'Üldkontroll', durationMinutes: 30, priceCents: 3900, priceIsFrom: true },
      { name: 'Vaktsineerimine', durationMinutes: 20, priceCents: 2900, priceIsFrom: true },
      { name: 'Küünte lõikus', durationMinutes: 15, priceCents: 1000 },
    ],
  },
];

// Idempotent without deleting: providers may already have bookings (services are `restrict`), so an
// existing sample is left as it is instead of being recreated.
const existing = new Set(
  (await db.select({ name: serviceProviders.name }).from(serviceProviders).where(inArray(serviceProviders.name, providers.map((p) => p.name)))).map(
    (r) => r.name,
  ),
);
let created = 0;
for (const { x, y, hours, services: list, ...provider } of providers) {
  if (existing.has(provider.name)) continue;
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(serviceProviders).values({ ...provider, location: { x, y } }).returning({ id: serviceProviders.id });
    const providerId = row!.id;
    await tx.insert(providerHours).values(hours.map(([weekday, opensAt, closesAt]) => ({ providerId, weekday, opensAt, closesAt })));
    await tx.insert(services).values(list.map((s) => ({ ...s, providerId })));
  });
  created++;
}
console.log(`Seeded ${created} service providers (${existing.size} already existed)`);
await pool.end();
