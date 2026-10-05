import type { Redemption, RedemptionInput } from '@kapp/shared';
import { useRef } from 'react';

import { ApiRequestError } from '@/lib/api';
import { createIdempotencyTracker, isRetryableStatus } from '@/lib/idempotency';

import { useRedeem } from './use-shop';

/**
 * "Lunasta" with an idempotency key per tap (lib/idempotency.ts): a retry after a lost answer reuses
 * the key, so the server returns the first code instead of spending the points again; a settled
 * answer (success, 409 not enough paws) clears it for the next tap.
 */
export function useRedeemOnce() {
  const redeem = useRedeem();
  const tracker = useRef(createIdempotencyTracker());

  async function run(offer: Omit<RedemptionInput, 'idempotencyKey'>): Promise<Redemption> {
    const idempotencyKey = tracker.current.begin();
    try {
      const redemption = await redeem.mutateAsync({ ...offer, idempotencyKey });
      tracker.current.settle({ retryable: false });
      return redemption;
    } catch (error) {
      tracker.current.settle({ retryable: isRetryableStatus(error instanceof ApiRequestError ? error.status : undefined) });
      throw error;
    }
  }

  return { run, isPending: redeem.isPending };
}
