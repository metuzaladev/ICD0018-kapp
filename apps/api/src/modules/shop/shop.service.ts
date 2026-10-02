import {
  REDEMPTION_VALID_DAYS,
  redemptionPointsCost,
  type Product,
  type Redemption,
  type RedemptionInput,
  type Shop,
  type ShopPartner,
  type ShopProductsQuery,
  type ShopQuery,
} from '@kapp/shared';

import { ConflictError, NotFoundError } from '../../http/errors';
import { randomCode } from '../../lib/codes';
import { isCheckViolation, isUniqueViolation } from '../../lib/db-errors';
import { withTimeout } from '../../lib/timeout';
import type { ObjectStorage } from '../../storage/object-storage';
import { DOWNLOAD_URL_TTL_SECONDS, storageCall } from '../photos/photo-storage';
import type { PartnerRecord, ProductRecord, RedemptionRecord, ShopRepository } from './shop.repository';

/**
 * "Pood": partner products and paw discounts, paid with Käpad. There is no checkout and no payment:
 * redeeming creates a single-use code that the partner checks in person (docs/16-avasta-ja-kapad.md).
 */
export interface ShopService {
  overview(query: ShopQuery): Promise<Shop>;
  products(query: ShopProductsQuery): Promise<Product[]>;
  product(productId: string): Promise<Product>;
  /** `created` false = an earlier redemption with the same idempotency key (HTTP 200, nothing spent). */
  redeem(userId: string, input: RedemptionInput): Promise<{ redemption: Redemption; created: boolean }>;
  listRedemptions(userId: string): Promise<Redemption[]>;
  /** Refunds the points of an unused code; idempotent. */
  cancelRedemption(userId: string, redemptionId: string): Promise<Redemption>;
}

export const SHOP_PARTNERS_LIMIT = 20;
export const SHOP_FEATURED_PRODUCTS = 10;
export const SHOP_PRODUCTS_LIMIT = 100;
export const REDEMPTIONS_LIMIT = 50;
export const REDEMPTION_CODE_LENGTH = 10;

export const discountedPrice = (priceCents: number, discountPercent: number) => Math.round((priceCents * (100 - discountPercent)) / 100);

export function createShopService({
  repository,
  storage,
  timeoutMs,
  now = () => new Date(),
}: {
  repository: ShopRepository;
  storage: Pick<ObjectStorage, 'createDownloadUrl'>;
  timeoutMs: number;
  now?: () => Date;
}): ShopService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);
  const sign = (key: string | null) => (key ? storageCall(storage.createDownloadUrl(key, DOWNLOAD_URL_TTL_SECONDS), timeoutMs, 'storage.sign') : Promise.resolve(null));

  async function toProduct({ imageKey, ...record }: ProductRecord): Promise<Product> {
    return {
      ...record,
      discountedPriceCents: discountedPrice(record.priceCents, record.discountPercent),
      pointsCost: redemptionPointsCost(record.discountPercent),
      imageUrl: await sign(imageKey),
    };
  }

  async function toPartner({ photoKey, distanceKm, ...record }: PartnerRecord): Promise<ShopPartner> {
    return {
      ...record,
      photoUrl: await sign(photoKey),
      pointsCost: redemptionPointsCost(record.pawDiscountPercent),
      ...(distanceKm === undefined ? {} : { distanceKm: Math.round(distanceKm * 10) / 10 }),
    };
  }

  function toRedemption({ userId: _userId, expiresAt, createdAt, status, ...record }: RedemptionRecord): Redemption {
    const expired = status === 'active' && expiresAt.getTime() <= now().getTime();
    return { ...record, status: expired ? 'expired' : status, expiresAt: expiresAt.toISOString(), createdAt: createdAt.toISOString() };
  }

  async function requireOwn(userId: string, redemptionId: string) {
    const record = await t(repository.findOwn(userId, redemptionId), 'shop.findRedemption');
    if (!record) throw new NotFoundError('errors.redemptionNotFound');
    return record;
  }

  /** What the offer is worth and costs; the client only names it (never a price or a cost). */
  async function resolveOffer({ offerType, offerId }: RedemptionInput) {
    if (offerType === 'product') {
      const product = await t(repository.findProduct(offerId), 'shop.findProduct');
      if (!product) throw new NotFoundError('errors.offerNotFound');
      return { providerId: product.provider.id, productId: product.id, discountPercent: product.discountPercent };
    }
    const partner = await t(repository.findPartner(offerId), 'shop.findPartner');
    if (!partner) throw new NotFoundError('errors.offerNotFound');
    return { providerId: partner.id, productId: null, discountPercent: partner.pawDiscountPercent };
  }

  return {
    async overview({ lat, lng }) {
      const origin = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
      const [categories, partners, products] = await Promise.all([
        t(repository.categories(), 'shop.categories'),
        t(repository.partners(origin, SHOP_PARTNERS_LIMIT), 'shop.partners'),
        t(repository.products({}, SHOP_FEATURED_PRODUCTS), 'shop.products'),
      ]);
      return { categories, partners: await Promise.all(partners.map(toPartner)), products: await Promise.all(products.map(toProduct)) };
    },

    async products(query) {
      const records = await t(repository.products(query, SHOP_PRODUCTS_LIMIT), 'shop.products');
      return Promise.all(records.map(toProduct));
    },

    async product(productId) {
      const record = await t(repository.findProduct(productId), 'shop.findProduct');
      if (!record) throw new NotFoundError('errors.productNotFound');
      return toProduct(record);
    },

    async redeem(userId, input) {
      const offer = await resolveOffer(input);
      const pointsCost = redemptionPointsCost(offer.discountPercent);
      const expiresAt = new Date(now().getTime() + REDEMPTION_VALID_DAYS * 86_400_000);
      // A code collision (≈50 bits) is practically impossible; one retry turns it into "never".
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await t(
            repository.redeem({ userId, offerType: input.offerType, ...offer, pointsCost, code: randomCode(REDEMPTION_CODE_LENGTH), idempotencyKey: input.idempotencyKey ?? null, expiresAt }),
            'shop.redeem',
          );
          if (result.status === 'insufficient') throw new ConflictError('errors.notEnoughPoints', { cost: pointsCost, balance: result.balance });
          return { redemption: toRedemption(await requireOwn(userId, result.id)), created: result.status === 'created' };
        } catch (error) {
          if (attempt === 0 && isUniqueViolation(error, 'redemptions_code_unique')) continue;
          // Backstops behind the locked checks in the repository (balance CHECK, idempotency index):
          // they can only fire if a writer skipped the lock, and still answer a clean 409.
          if (isCheckViolation(error, 'reward_balances_nonnegative')) throw new ConflictError('errors.notEnoughPoints', { cost: pointsCost, balance: 0 });
          if (isUniqueViolation(error, 'redemptions_idempotency_uq')) throw new ConflictError();
          throw error;
        }
      }
    },

    async listRedemptions(userId) {
      return (await t(repository.listOwn(userId, REDEMPTIONS_LIMIT), 'shop.listRedemptions')).map(toRedemption);
    },

    async cancelRedemption(userId, redemptionId) {
      const result = await t(repository.cancel(userId, redemptionId), 'shop.cancelRedemption');
      if (result === 'not-found') throw new NotFoundError('errors.redemptionNotFound');
      if (result === 'not-cancellable') throw new ConflictError('errors.redemptionNotCancellable');
      return toRedemption(await requireOwn(userId, redemptionId));
    },
  };
}
