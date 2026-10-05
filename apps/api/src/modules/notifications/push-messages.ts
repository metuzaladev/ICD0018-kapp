import { translate, type Language, type NotificationData, type NotificationPreferences, type NotificationType } from '@kapp/shared';

/**
 * Push texts in the RECIPIENT's language (stored on the user), built from the shared message
 * tables so they go through the same i18n checks as every other text. The in-app feed does not use
 * these: the app renders notifications itself, in whatever language it currently shows.
 */

/** Which Settings / Notifications switch controls a type. */
export const PREFERENCE_FOR: Record<NotificationType, keyof NotificationPreferences> = {
  friend_request: 'friendRequests',
  friend_accepted: 'friendRequests',
  message: 'messages',
  friend_plan: 'friendPlans',
  booking_confirmed: 'bookings',
  booking_cancelled: 'bookings',
  booking_reminder: 'bookings',
};

/** The app and the parks are in Tallinn; plan times are shown in Estonian time for everyone. */
const TIME_ZONE = 'Europe/Tallinn';
const LOCALE_TAG: Record<Language, string> = { et: 'et-EE', en: 'en-GB', ru: 'ru-RU' };

/** A preview, not the whole message: lock screens are seen by others, and payloads are size-limited. */
export const PREVIEW_LENGTH = 120;
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
  type: NotificationType,
  actorName: string,
  data: NotificationData,
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
  }
}
