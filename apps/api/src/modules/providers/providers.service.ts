import {
  SLOT_STEP_MINUTES,
  type ProviderDetail,
  type ProvidersQuery,
  type ProviderSummary,
  type ServiceSlots,
  type SlotDay,
  type SlotsQuery,
} from '@kapp/shared';

import { NotFoundError } from '../../http/errors';
import { addDays, localDate } from '../../lib/calendar';
import { withTimeout } from '../../lib/timeout';
import type { ObjectStorage } from '../../storage/object-storage';
import { bookableWindow } from '../bookings/booking-rules';
import { DOWNLOAD_URL_TTL_SECONDS, storageCall } from '../photos/photo-storage';
import type { ProviderRecord, ProvidersRepository } from './providers.repository';

/** The service catalogue: who offers what, and which times are free. Public data, no user involved. */
export interface ProvidersService {
  list(query: ProvidersQuery): Promise<ProviderSummary[]>;
  getProvider(providerId: string): Promise<ProviderDetail>;
  listSlots(serviceId: string, query: SlotsQuery): Promise<ServiceSlots>;
}

/** Tallinn has a few dozen dog businesses; 50 keeps the response bounded without paging. */
export const PROVIDERS_LIMIT = 50;

export function createProvidersService({
  repository,
  storage,
  timeoutMs,
  now = () => new Date(),
}: {
  repository: ProvidersRepository;
  storage: Pick<ObjectStorage, 'createDownloadUrl'>;
  timeoutMs: number;
  /** Injectable clock: slot rules depend on "now". */
  now?: () => Date;
}): ProvidersService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  async function toSummary({ photoKey, distanceKm, ...record }: ProviderRecord): Promise<ProviderSummary> {
    return {
      ...record,
      photoUrl: photoKey ? await storageCall(storage.createDownloadUrl(photoKey, DOWNLOAD_URL_TTL_SECONDS), timeoutMs, 'storage.sign') : null,
      // One decimal like parks ("1,2 km").
      ...(distanceKm === undefined ? {} : { distanceKm: Math.round(distanceKm * 10) / 10 }),
    };
  }

  return {
    async list({ category, lat, lng, radiusKm }) {
      const origin = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
      const records = await t(repository.list({ category, origin, radiusKm }, PROVIDERS_LIMIT), 'providers.list');
      return Promise.all(records.map(toSummary));
    },

    async getProvider(providerId) {
      const record = await t(repository.findById(providerId), 'providers.findById');
      if (!record) throw new NotFoundError('errors.providerNotFound');
      const { services, description, address, timeZone, ...summary } = record;
      return { ...(await toSummary(summary)), description, address, timeZone, services };
    },

    async listSlots(serviceId, { from, days }) {
      const service = await t(repository.findService(serviceId), 'providers.findService');
      if (!service) throw new NotFoundError('errors.serviceNotFound');
      const { timeZone } = service.provider;
      const current = now();
      // Days are the provider's calendar days: "today" in Tallinn, not on the server or the phone.
      const start = from ?? localDate(current, timeZone);
      const free = await t(
        repository.findFreeSlots({ serviceId, from: start, days, stepMinutes: SLOT_STEP_MINUTES, ...bookableWindow(current) }),
        'providers.findFreeSlots',
      );
      const byDay = new Map<string, SlotDay['slots']>();
      for (const slot of free) {
        byDay.set(slot.day, [...(byDay.get(slot.day) ?? []), { startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() }]);
      }
      return {
        serviceId,
        timeZone,
        days: Array.from({ length: days }, (_, i) => {
          const date = addDays(start, i);
          return { date, slots: byDay.get(date) ?? [] };
        }),
      };
    },
  };
}
