/**
 * Development seed: real Estonian dog parks and dog swimming spots (koertepargid.ee, facts only —
 * db/park-import.ts) so the map and "nearby" query have data, and (M6) fictional dog service
 * providers so the booking flow can be tried end to end.
 * Providers are invented (the app says so on the Services screen); any likeness to a real business
 * name is unintended.
 * M9b adds paw discounts and invented products for those providers and a few approved demo place
 * posts (invented café/shop names, approximate coordinates) by a system author that cannot sign in.
 * Insert-only and idempotent: re-running never deletes anything; the only update hides the six
 * invented parks of the first seeds (status → rejected).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { readFileSync } from 'node:fs';

import { db, pool } from './client';
import { isInEstonia, toParkRow, type SourcePark } from './park-import';
import { partnerProducts, parks, placePosts, providerHours, serviceProviders, services, user } from './schema';

/* ---------- Parks: real Estonian dog parks (koertepargid.ee, facts only — see db/park-import.ts) ---------- */

const source = JSON.parse(readFileSync(new URL('./data/koertepargid.json', import.meta.url), 'utf8')) as { parks: SourcePark[] };
const realParks = source.parks.filter(isInEstonia).map(toParkRow);

// Insert only the missing parks, never delete and recreate: favourites, check-ins, plans, reviews and
// photos reference parks with ON DELETE CASCADE, so re-running the seed must not touch existing rows.
const existingParks = new Set(
  (await db.select({ name: parks.name }).from(parks).where(inArray(parks.name, realParks.map((p) => p.name)))).map((r) => r.name),
);
const missingParks = realParks.filter((p) => !existingParks.has(p.name));
for (let i = 0; i < missingParks.length; i += 50) await db.insert(parks).values(missingParks.slice(i, i + 50));
console.log(`Seeded ${missingParks.length} parks from koertepargid.ee (${existingParks.size} already existed)`);

// The first seeds had six invented Tallinn parks ("Kadrioru koerapark" …) with approximate
// coordinates. Hide them now that real parks exist: status → rejected, which the public queries
// already filter out. Not deleted — a delete would cascade away users' check-ins and reviews.
const INVENTED_SAMPLES = ['Kadrioru koerapark', 'Stroomi koerapark', 'Nõmme koerapark', 'Mustamäe koerapark', 'Lasnamäe koerapark', 'Pirita koerapark'];
const retired = await db
  .update(parks)
  .set({ status: 'rejected' })
  .where(and(inArray(parks.name, INVENTED_SAMPLES), isNull(parks.createdBy), eq(parks.status, 'approved')))
  .returning({ id: parks.id });
if (retired.length) console.log(`Hid ${retired.length} invented sample parks`);

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

/* ---------- M9b: paw discounts, partner products, demo place posts (docs/16) ---------- */
// Same rule as above: insert what is missing, never delete or overwrite what someone changed.

const pawDiscounts: Record<string, number> = { Käpakoda: 15, 'Kalamaja Karvastuudio': 10, 'Hea Kutsu koerakool': 10, 'Saba ja Sõbrad loomakliinik': 5 };
for (const [name, percent] of Object.entries(pawDiscounts)) {
  await db
    .update(serviceProviders)
    .set({ pawDiscountPercent: percent })
    .where(and(eq(serviceProviders.name, name), isNull(serviceProviders.pawDiscountPercent)));
}

// Invented products for the invented providers.
const productSamples: { provider: string; name: string; description: string; category: 'food' | 'treats' | 'toys' | 'accessories' | 'care'; priceCents: number; discountPercent: number }[] = [
  { provider: 'Käpakoda', name: 'Kaerahelbešampoon tundlikule nahale', description: 'Lõhnatu, 250 ml.', category: 'care', priceCents: 1490, discountPercent: 15 },
  { provider: 'Käpakoda', name: 'Pehme harjake', description: 'Lühikesele ja keskmisele karvale.', category: 'care', priceCents: 1190, discountPercent: 10 },
  { provider: 'Kalamaja Karvastuudio', name: 'Käpavaha talveks', description: 'Kaitseb käpapatju soola ja külma eest.', category: 'care', priceCents: 990, discountPercent: 10 },
  { provider: 'Hea Kutsu koerakool', name: 'Treeningmaiused lõhega', description: 'Väikesed pehmed palad, 150 g.', category: 'treats', priceCents: 690, discountPercent: 10 },
  { provider: 'Hea Kutsu koerakool', name: 'Treeningkott vööle', description: 'Magnetsulgurega maiusekott.', category: 'accessories', priceCents: 1890, discountPercent: 10 },
  { provider: 'Hea Kutsu koerakool', name: 'Nuputamismänguasi', description: 'Peida maius, lase koeral otsida.', category: 'toys', priceCents: 2290, discountPercent: 15 },
  { provider: 'Saba ja Sõbrad loomakliinik', name: 'Hambahoolduse närimispulgad', description: '7 tk pakis.', category: 'treats', priceCents: 850, discountPercent: 5 },
  { provider: 'Saba ja Sõbrad loomakliinik', name: 'Tundliku kõhu täissööt', description: 'Kalkun ja riis, 2 kg.', category: 'food', priceCents: 2490, discountPercent: 5 },
];
const providerIds = new Map(
  (await db.select({ id: serviceProviders.id, name: serviceProviders.name }).from(serviceProviders).where(inArray(serviceProviders.name, Object.keys(pawDiscounts)))).map(
    (r) => [r.name, r.id],
  ),
);
const existingProducts = new Set(
  (await db.select({ name: partnerProducts.name, providerId: partnerProducts.providerId }).from(partnerProducts)).map((r) => `${r.providerId}|${r.name}`),
);
const missingProducts = productSamples
  .filter((p) => providerIds.has(p.provider) && !existingProducts.has(`${providerIds.get(p.provider)}|${p.name}`))
  .map(({ provider, ...p }) => ({ ...p, providerId: providerIds.get(provider)! }));
if (missingProducts.length > 0) await db.insert(partnerProducts).values(missingProducts);
console.log(`Seeded ${missingProducts.length} partner products`);

// Demo posts need an author: a system user without any login method (no account row, so nobody can
// sign in as it). Places are invented, with approximate Tallinn coordinates — sample data only.
const SEED_AUTHOR_ID = 'seed_kapp_community';
await db
  .insert(user)
  .values({ id: SEED_AUTHOR_ID, name: 'Käpp kogukond', email: 'kogukond@seed.kapp.invalid', emailVerified: true, allowFriendRequests: false })
  .onConflictDoNothing();
const postSamples: {
  name: string;
  category: 'cafe' | 'park' | 'beach' | 'shop' | 'other';
  address: string;
  x: number;
  y: number;
  amenities: ('dogs_inside' | 'water_bowl' | 'terrace' | 'dog_treats' | 'fenced_area' | 'off_leash' | 'shade' | 'stream')[];
  body: string;
}[] = [
  {
    name: 'Kohvik Käpajälg',
    category: 'cafe',
    address: 'Kalamaja, Tallinn',
    x: 24.734,
    y: 59.447,
    amenities: ['dogs_inside', 'water_bowl', 'dog_treats', 'terrace'],
    body: 'Koerad on oodatud ka sisse, veekauss ukse juures ja letis on koeraküpsised.',
  },
  {
    name: 'Rannakohvik Sabaliputus',
    category: 'cafe',
    address: 'Pirita, Tallinn',
    x: 24.836,
    y: 59.465,
    amenities: ['terrace', 'water_bowl', 'shade'],
    body: 'Suur terrass mere ääres, varjuline nurk koertele. Hommikuti vaikne.',
  },
  {
    name: 'Männiku metsarada',
    category: 'park',
    address: 'Nõmme, Tallinn',
    x: 24.69,
    y: 59.375,
    amenities: ['off_leash', 'shade', 'stream'],
    body: 'Pehme rada männimetsas ja oja, kus koer saab jalad märjaks teha.',
  },
  {
    name: 'Stroomi koerte rannaosa',
    category: 'beach',
    address: 'Pelguranna, Tallinn',
    x: 24.692,
    y: 59.449,
    amenities: ['water_bowl', 'off_leash'],
    body: 'Hooajavälisel ajal hea koht ujumiseks. Suvel järgi kohalikke reegleid.',
  },
  {
    name: 'Lemmikloomapood Krõbe',
    category: 'shop',
    address: 'Kesklinn, Tallinn',
    x: 24.752,
    y: 59.435,
    amenities: ['dogs_inside', 'dog_treats', 'water_bowl'],
    body: 'Lahke teenindus, koer võib kaasa tulla ja maiust proovida.',
  },
];
const existingPosts = new Set(
  (await db.select({ name: placePosts.name }).from(placePosts).where(and(eq(placePosts.authorId, SEED_AUTHOR_ID), inArray(placePosts.name, postSamples.map((p) => p.name))))).map(
    (r) => r.name,
  ),
);
const missingPosts = postSamples.filter((p) => !existingPosts.has(p.name));
if (missingPosts.length > 0) {
  await db
    .insert(placePosts)
    .values(missingPosts.map(({ x, y, ...p }) => ({ ...p, authorId: SEED_AUTHOR_ID, location: { x, y }, status: 'approved' as const, moderatedAt: new Date() })));
}
console.log(`Seeded ${missingPosts.length} demo place posts (${existingPosts.size} already existed)`);
await pool.end();
