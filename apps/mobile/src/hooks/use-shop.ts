import type { Product, ProductCategory, Redemption, RedemptionInput, Shop } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

import { rewardKeys } from './use-rewards';

/**
 * Pood (docs/16): partners with paw discounts, partner products and the user's single-use codes.
 * No payments anywhere: a redemption spends Käpad for a discount code shown at the partner.
 */
export const shopKeys = {
  all: ['shop'] as const,
  overview: (origin: { lat: number; lng: number } | null) => ['shop', 'overview', origin] as const,
  products: (category: ProductCategory | null, providerId: string | null) => ['shop', 'products', category, providerId] as const,
  product: (productId: string) => ['shop', 'product', productId] as const,
  redemptions: ['redemptions'] as const,
};

/** Product images are signed URLs (15 min): refresh before they expire, like post photos. */
const SIGNED_URL_STALE_MS = 5 * 60_000;

export function useShop(origin: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: shopKeys.overview(origin),
    queryFn: () => apiGet<Shop>('/shop', origin ?? undefined),
    staleTime: SIGNED_URL_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useProducts(category: ProductCategory | null, providerId: string | null = null) {
  return useQuery({
    queryKey: shopKeys.products(category, providerId),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (category) params.category = category;
      if (providerId) params.providerId = providerId;
      return apiGet<Product[]>('/shop/products', params);
    },
    staleTime: SIGNED_URL_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useProduct(productId: string) {
  return useQuery({ queryKey: shopKeys.product(productId), queryFn: () => apiGet<Product>(`/shop/products/${productId}`), staleTime: SIGNED_URL_STALE_MS });
}

/** "Minu koodid", newest first. There is no single-code endpoint: the code screen reads this list. */
export function useRedemptions() {
  return useQuery({ queryKey: shopKeys.redemptions, queryFn: () => apiGet<Redemption[]>('/me/redemptions') });
}

function useInvalidateWallet() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: shopKeys.redemptions });
    client.invalidateQueries({ queryKey: rewardKeys.all });
  };
}

/**
 * POST /me/redemptions. The caller passes an idempotency key made once per tap (lib/idempotency.ts):
 * a retry after a lost answer returns the first code instead of spending twice. A 409 ("not enough
 * paws: need 150, you have 40") arrives already in the user's language.
 */
export function useRedeem() {
  const client = useQueryClient();
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (input: Required<RedemptionInput>) => apiSend<Redemption>('POST', '/me/redemptions', input),
    onSuccess: (redemption) => client.setQueryData<Redemption[]>(shopKeys.redemptions, (list) => [redemption, ...(list ?? []).filter((r) => r.id !== redemption.id)]),
    onSettled: invalidate,
  });
}

/** Cancels an unused code and refunds the points (idempotent on the server). */
export function useCancelRedemption() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (redemptionId: string) => apiSend<Redemption>('POST', `/me/redemptions/${redemptionId}/cancel`),
    onSettled: invalidate,
  });
}
