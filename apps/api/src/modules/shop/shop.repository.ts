import type { ProductCategory, ServiceCategory } from '@kapp/shared';
import { and, asc, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { partnerProducts, redemptions, serviceProviders } from '../../db/schema';
import { appendEntries, lockBalance } from '../rewards/rewards.repository';
import { dayOf } from '../rewards/reward-rules';

/**
 * Data access for the partner shop and redemptions. Redeeming and cancelling write the Käpad ledger
 * through the rewards repository helpers inside their own transaction, with the balance row locked —
 * so two redemptions at the same moment can never spend the same points.
 */

export interface PartnerRecord {
  id: string;
  name: string;
  category: ServiceCategory;
  tagline: string | null;
  area: string;
  lat: number;
  lng: number;
  photoKey: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  priceFromCents: number | null;
  pawDiscountPercent: number;
  distanceKm?: number;
}

export interface ProductRecord {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  priceCents: number;
  discountPercent: number;
  imageKey: string | null;
  provider: { id: string; name: string; area: string };
}

export interface RedemptionRecord {
  id: string;
  userId: string;
  offerType: 'booking' | 'product';
  provider: { id: string; name: string };
  product: { id: string; name: string } | null;
  discountPercent: number;
  pointsCost: number;
  code: string;
  status: 'active' | 'used' | 'cancelled';
  expiresAt: Date;
  bookingId: string | null;
  createdAt: Date;
}

export interface NewRedemption {
  userId: string;
  offerType: 'booking' | 'product';
  providerId: string;
  productId: string | null;
  discountPercent: number;
  pointsCost: number;
  code: string;
  idempotencyKey: string | null;
  expiresAt: Date;
}

export type RedeemResult =
  | { status: 'created'; id: string }
  /** The same idempotency key was used before: the first redemption, nothing spent again. */
  | { status: 'existing'; id: string }
  | { status: 'insufficient'; balance: number };

export type CancelResult = 'cancelled' | 'already-cancelled' | 'not-cancellable' | 'not-found';

export interface ShopRepository {
  categories(): Promise<{ id: ProductCategory; productCount: number }[]>;
  partners(origin: { lat: number; lng: number } | undefined, limit: number): Promise<PartnerRecord[]>;
  findPartner(providerId: string): Promise<{ id: string; name: string; pawDiscountPercent: number } | null>;
  products(filter: { category?: ProductCategory; providerId?: string }, limit: number): Promise<ProductRecord[]>;
  /** Active products only. */
  findProduct(productId: string): Promise<ProductRecord | null>;
  redeem(input: NewRedemption): Promise<RedeemResult>;
  /** Refunds an active, unused, unexpired code; idempotent. */
  cancel(userId: string, redemptionId: string): Promise<CancelResult>;
  listOwn(userId: string, limit: number): Promise<RedemptionRecord[]>;
  /** Only the user's own; null for missing and foreign ids alike. */
  findOwn(userId: string, redemptionId: string): Promise<RedemptionRecord | null>;
}

const OUTER_PROVIDER_ID = sql.raw('"service_providers"."id"');

const partnerColumns = {
  id: serviceProviders.id,
  name: serviceProviders.name,
  category: serviceProviders.category,
  tagline: serviceProviders.tagline,
  area: serviceProviders.area,
  location: serviceProviders.location,
  photoKey: serviceProviders.photoKey,
  ratingAverage: serviceProviders.ratingAverage,
  ratingCount: serviceProviders.ratingCount,
  pawDiscountPercent: serviceProviders.pawDiscountPercent,
  priceFromCents: sql<number | null>`(select min(s.price_cents)::int from services s where s.provider_id = ${OUTER_PROVIDER_ID})`,
};

const productColumns = {
  id: partnerProducts.id,
  name: partnerProducts.name,
  description: partnerProducts.description,
  category: partnerProducts.category,
  priceCents: partnerProducts.priceCents,
  discountPercent: partnerProducts.discountPercent,
  imageKey: partnerProducts.imageKey,
  providerId: serviceProviders.id,
  providerName: serviceProviders.name,
  providerArea: serviceProviders.area,
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  priceCents: number;
  discountPercent: number;
  imageKey: string | null;
  providerId: string;
  providerName: string;
  providerArea: string;
};

const toProduct = ({ providerId, providerName, providerArea, ...rest }: ProductRow): ProductRecord => ({
  ...rest,
  provider: { id: providerId, name: providerName, area: providerArea },
});

const redemptionColumns = sql`
  r.id, r.user_id, r.offer_type, r.provider_id, sp.name as provider_name, r.product_id, pp.name as product_name,
  r.discount_percent, r.points_cost, r.code, r.status, r.expires_at, r.created_at,
  (select b.id from bookings b where b.redemption_id = r.id) as booking_id`;

type RedemptionRow = {
  id: string;
  user_id: string;
  offer_type: 'booking' | 'product';
  provider_id: string;
  provider_name: string;
  product_id: string | null;
  product_name: string | null;
  discount_percent: number;
  points_cost: number;
  code: string;
  status: 'active' | 'used' | 'cancelled';
  expires_at: Date;
  created_at: Date;
  booking_id: string | null;
};

const toRedemption = (r: RedemptionRow): RedemptionRecord => ({
  id: r.id,
  userId: r.user_id,
  offerType: r.offer_type,
  provider: { id: r.provider_id, name: r.provider_name },
  product: r.product_id && r.product_name ? { id: r.product_id, name: r.product_name } : null,
  discountPercent: r.discount_percent,
  pointsCost: r.points_cost,
  code: r.code,
  status: r.status,
  expiresAt: new Date(r.expires_at),
  bookingId: r.booking_id,
  createdAt: new Date(r.created_at),
});

export function createShopRepository(db: Db): ShopRepository {
  async function selectRedemptions(where: SQL, limit: number) {
    const { rows } = await db.execute<RedemptionRow>(sql`
      select ${redemptionColumns}
      from redemptions r
      join service_providers sp on sp.id = r.provider_id
      left join partner_products pp on pp.id = r.product_id
      where ${where}
      order by r.created_at desc, r.id desc
      limit ${limit}`);
    return rows.map(toRedemption);
  }

  return {
    async categories() {
      const rows = await db
        .select({ id: partnerProducts.category, productCount: sql<number>`count(*)::int` })
        .from(partnerProducts)
        .where(eq(partnerProducts.active, true))
        .groupBy(partnerProducts.category)
        .orderBy(asc(partnerProducts.category));
      return rows;
    },

    async partners(origin, limit) {
      const isPartner = isNotNull(serviceProviders.pawDiscountPercent);
      const toRecord = ({ location, ratingAverage, pawDiscountPercent, ...rest }: Record<string, unknown> & { location: { x: number; y: number }; ratingAverage: number | null; pawDiscountPercent: number | null }) => ({
        ...(rest as Omit<PartnerRecord, 'lat' | 'lng' | 'ratingAverage' | 'pawDiscountPercent'>),
        lat: location.y,
        lng: location.x,
        ratingAverage: ratingAverage === null ? null : Number(ratingAverage),
        pawDiscountPercent: pawDiscountPercent ?? 0,
      });
      if (!origin) {
        const rows = await db.select(partnerColumns).from(serviceProviders).where(isPartner).orderBy(asc(serviceProviders.name)).limit(limit);
        return rows.map(toRecord);
      }
      const point = sql`ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography`;
      const distanceKm = sql<number>`ST_Distance(${serviceProviders.location}::geography, ${point}) / 1000`;
      const rows = await db
        .select({ ...partnerColumns, distanceKm })
        .from(serviceProviders)
        .where(isPartner)
        .orderBy(distanceKm)
        .limit(limit);
      return rows.map((r) => ({ ...toRecord(r), distanceKm: Number(r.distanceKm) }));
    },

    async findPartner(providerId) {
      const [row] = await db
        .select({ id: serviceProviders.id, name: serviceProviders.name, pawDiscountPercent: serviceProviders.pawDiscountPercent })
        .from(serviceProviders)
        .where(and(eq(serviceProviders.id, providerId), isNotNull(serviceProviders.pawDiscountPercent)));
      return row ? { ...row, pawDiscountPercent: row.pawDiscountPercent! } : null;
    },

    async products({ category, providerId }, limit) {
      const conditions: SQL[] = [eq(partnerProducts.active, true)];
      if (category) conditions.push(eq(partnerProducts.category, category));
      if (providerId) conditions.push(eq(partnerProducts.providerId, providerId));
      const rows = await db
        .select(productColumns)
        .from(partnerProducts)
        .innerJoin(serviceProviders, eq(serviceProviders.id, partnerProducts.providerId))
        .where(and(...conditions))
        .orderBy(desc(partnerProducts.discountPercent), asc(partnerProducts.name))
        .limit(limit);
      return rows.map((r) => toProduct(r as ProductRow));
    },

    async findProduct(productId) {
      const [row] = await db
        .select(productColumns)
        .from(partnerProducts)
        .innerJoin(serviceProviders, eq(serviceProviders.id, partnerProducts.providerId))
        .where(and(eq(partnerProducts.id, productId), eq(partnerProducts.active, true)));
      return row ? toProduct(row as ProductRow) : null;
    },

    redeem(input) {
      return db.transaction(async (tx): Promise<RedeemResult> => {
        const { balance } = await lockBalance(tx, input.userId);
        if (input.idempotencyKey) {
          const [existing] = await tx
            .select({ id: redemptions.id })
            .from(redemptions)
            .where(and(eq(redemptions.userId, input.userId), eq(redemptions.idempotencyKey, input.idempotencyKey)));
          if (existing) return { status: 'existing', id: existing.id };
        }
        // Checked under the lock: no other award or redemption of this user can run in between.
        if (balance < input.pointsCost) return { status: 'insufficient', balance };
        const [created] = await tx.insert(redemptions).values(input).returning({ id: redemptions.id });
        await appendEntries(tx, input.userId, [{ reason: 'redemption', sourceId: created!.id, delta: -input.pointsCost, day: dayOf(new Date()) }]);
        return { status: 'created', id: created!.id };
      });
    },

    cancel(userId, redemptionId) {
      return db.transaction(async (tx): Promise<CancelResult> => {
        await lockBalance(tx, userId);
        const [cancelled] = await tx
          .update(redemptions)
          .set({ status: 'cancelled', cancelledAt: sql`now()` })
          .where(
            and(
              eq(redemptions.id, redemptionId),
              eq(redemptions.userId, userId),
              eq(redemptions.status, 'active'),
              sql`${redemptions.expiresAt} > now()`,
              // A code attached to a booking is in use; cancel the booking first (that frees it).
              sql`not exists (select 1 from bookings b where b.redemption_id = ${redemptionId})`,
            ),
          )
          .returning({ pointsCost: redemptions.pointsCost });
        if (cancelled) {
          await appendEntries(tx, userId, [{ reason: 'redemption_refund', sourceId: redemptionId, delta: cancelled.pointsCost, day: dayOf(new Date()) }]);
          return 'cancelled';
        }
        const [existing] = await tx
          .select({ status: redemptions.status })
          .from(redemptions)
          .where(and(eq(redemptions.id, redemptionId), eq(redemptions.userId, userId)));
        if (!existing) return 'not-found';
        return existing.status === 'cancelled' ? 'already-cancelled' : 'not-cancellable';
      });
    },

    listOwn: (userId, limit) => selectRedemptions(sql`r.user_id = ${userId}`, limit),

    async findOwn(userId, redemptionId) {
      const [record] = await selectRedemptions(sql`r.user_id = ${userId} and r.id = ${redemptionId}`, 1);
      return record ?? null;
    },
  };
}
