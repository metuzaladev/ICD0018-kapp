import {
  translate,
  type AnyNotificationType,
  type Language,
  type NotificationPreferencesWithRewards,
  type RewardBadgeId,
  type RewardLevelId,
  type RewardNotificationData,
} from '@kapp/shared';

/**
 * Push texts in the RECIPIENT's language (stored on the user), built from the shared message
 * tables so they go through the same i18n checks as every other text. The in-app feed does not use
 * these: the app renders notifications itself, in whatever language it currently shows.
 */

/** Which Settings / Notifications switch controls a type. */
export const PREFERENCE_FOR: Record<AnyNotificationType, keyof NotificationPreferencesWithRewards> = {
  friend_request: 'friendRequests',
  friend_accepted: 'friendRequests',
  message: 'messages',
  friend_plan: 'friendPlans',
  booking_confirmed: 'bookings',
  booking_cancelled: 'bookings',
  booking_reminder: 'bookings',
  // M9b: one switch for everything Käpad (docs/16-avasta-ja-kapad.md).
  reward_level_up: 'rewards',
  reward_badge: 'rewards',
  place_post_approved: 'rewards',
};

/** The app and the parks are in Tallinn; plan times are shown in Estonian time for everyone. */
const TIME_ZONE = 'Europe/Tallinn';
const LOCALE_TAG: Record<Language, string> = { et: 'et-EE', en: 'en-GB', ru: 'ru-RU' };

/** A preview, not the whole message: lock screens are seen by others, and payloads are size-limited. */
const PREVIEW_LENGTH = 120;
export const preview = (text: string) => (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text);

/** "R 17.00–18.00" / "Fri 17:00–18:00" / "пт 17:00–18:00" — same time style as the app (lib/format.ts). */
export function formatPlanWindow(language: Language, startsAt: string, endsAt: string): string {
  const locale = LOCALE_TAG[language];
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: TIME_ZONE }).format(new Date(startsAt));
  const time = (iso: string) => {
    const text = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(new Date(iso));
    return language === 'et' ? text.replace(':', '.') : text;
  };
  return `${day} ${time(startsAt)}–${time(endsAt)}`;
}

/** "R 3. okt 10.00" / "Fri 3 Oct 10:00" / "пт, 3 окт. 10:00" — a booking start in Tallinn time. */
export function formatBookingStart(language: Language, startsAt: string): string {
  const locale = LOCALE_TAG[language];
  const instant = new Date(startsAt);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIME_ZONE }).format(instant);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(instant);
  return `${day} ${language === 'et' ? time.replace(':', '.') : time}`;
}

const BOOKING_TITLE = {
  booking_confirmed: 'push.bookingConfirmed.title',
  booking_cancelled: 'push.bookingCancelled.title',
  booking_reminder: 'push.bookingReminder.title',
} as const;

export function composePush(
  language: Language,
  type: AnyNotificationType,
  actorName: string,
  data: RewardNotificationData,
): { title: string; body: string } {
  const name = actorName;
  switch (type) {
    case 'friend_request':
      return { title: translate(language, 'push.friendRequest.title'), body: translate(language, 'push.friendRequest.body', { name }) };
    case 'friend_accepted':
      return { title: translate(language, 'push.friendAccepted.title'), body: translate(language, 'push.friendAccepted.body', { name }) };
    case 'message':
      return { title: translate(language, 'push.message.title', { name }), body: data.preview ?? '' };
    case 'friend_plan':
      return {
        title: translate(language, 'push.friendPlan.title', { name }),
        body: translate(language, 'push.friendPlan.body', {
          park: data.parkName ?? '',
          when: data.startsAt && data.endsAt ? formatPlanWindow(language, data.startsAt, data.endsAt) : '',
        }),
      };
    case 'booking_confirmed':
    case 'booking_cancelled':
    case 'booking_reminder':
      return {
        title: translate(language, BOOKING_TITLE[type]),
        body: translate(language, 'push.booking.body', {
          service: data.serviceName ?? '',
          provider: data.providerName ?? '',
          when: data.startsAt ? formatBookingStart(language, data.startsAt) : '',
        }),
      };
    case 'reward_level_up':
      return {
        title: translate(language, 'push.rewardLevelUp.title'),
        body: translate(language, 'push.rewardLevelUp.body', { level: data.levelId ? translate(language, LEVEL_NAME[data.levelId]) : '' }),
      };
    case 'reward_badge':
      return {
        title: translate(language, 'push.rewardBadge.title'),
        body: translate(language, 'push.rewardBadge.body', { badge: data.badgeId ? translate(language, BADGE_NAME[data.badgeId]) : '' }),
      };
    case 'place_post_approved':
      return {
        title: translate(language, 'push.placePostApproved.title'),
        body: translate(language, 'push.placePostApproved.body', { place: data.placeName ?? '', points: data.points ?? '' }),
      };
  }
}

const LEVEL_NAME = {
  puppy: 'rewards.level.puppy',
  park_friend: 'rewards.level.park_friend',
  park_legend: 'rewards.level.park_legend',
  pack_leader: 'rewards.level.pack_leader',
} as const satisfies Record<RewardLevelId, string>;

const BADGE_NAME = {
  early_bird: 'rewards.badge.early_bird',
  ten_parks: 'rewards.badge.ten_parks',
  explorer: 'rewards.badge.explorer',
  kadriorg_legend: 'rewards.badge.kadriorg_legend',
} as const satisfies Record<RewardBadgeId, string>;
