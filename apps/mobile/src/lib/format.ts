import type { DogSex } from '@kapp/shared';

import i18n, { currentLanguage, currentLocaleTag } from '@/i18n';

/**
 * Display formats in the active language. One place so every screen shows "17.00", "1,2 km" and
 * "täna" the same way. Numbers and dates go through Intl with the active locale; words that
 * follow a number go through plural keys (Intl.PluralRules via i18next: Estonian and English
 * one/other, Russian one/few/many), so "1 foto" / "5 fotot" / "5 фото" are always right.
 *
 * Screens call these during render after `useTranslation()`, so a language change re-renders them.
 */

const number = (value: number, maximumFractionDigits = 1) =>
  new Intl.NumberFormat(currentLocaleTag(), { maximumFractionDigits }).format(value);

/** "1,2 km" / "1.2 km" / "1,2 км" */
export function formatKm(km: number | undefined): string | null {
  return km === undefined ? null : i18n.t('units.km', { value: number(km) });
}

/** "12,5 kg" */
export function formatKg(kg: number): string {
  return i18n.t('units.kg', { value: number(kg) });
}

/** A rating average such as "4,8". */
export function formatRating(value: number): string {
  return number(value);
}

/**
 * "17.00" in Estonian (the Figma copy and the Estonian norm use a dot; Intl gives "17:00"),
 * "17:00" in English and Russian.
 */
export function formatTime(iso: string | Date): string {
  const text = new Date(iso).toLocaleTimeString(currentLocaleTag(), { hour: '2-digit', minute: '2-digit' });
  return currentLanguage() === 'et' ? text.replace(':', '.') : text;
}

/**
 * A time in a given IANA zone — booking times are the provider's wall clock (Europe/Tallinn), so a
 * phone abroad still shows the time the groomer expects the dog. Same "17.00" rule as formatTime.
 */
export function formatTimeIn(iso: string, timeZone: string): string {
  const text = new Date(iso).toLocaleTimeString(currentLocaleTag(), { hour: '2-digit', minute: '2-digit', timeZone });
  return currentLanguage() === 'et' ? text.replace(':', '.') : text;
}

/** "teisipäev, 6. oktoober" in the provider's zone — the date on a booking card. */
export function formatDateIn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString(currentLocaleTag(), { weekday: 'long', day: 'numeric', month: 'long', timeZone });
}

/**
 * A slot day chip from a calendar date ("2026-10-06"): "Täna", "Homme" or "R 9. okt". A chip is a
 * standalone label, so it starts with a capital ("täna" stays lowercase mid-sentence elsewhere,
 * and Russian weekday abbreviations are lowercase by default: "пт" → "Пт").
 */
export function formatDayChip(isoDate: string, now = new Date()): string {
  const day = localDate(isoDate);
  const diff = Math.round((day.getTime() - startOfDay(now)) / 86_400_000);
  const label =
    diff === 0
      ? i18n.t('dates.today')
      : diff === 1
        ? i18n.t('dates.tomorrow')
        : day.toLocaleDateString(currentLocaleTag(), { weekday: 'short', day: 'numeric', month: 'short' });
  return label.charAt(0).toLocaleUpperCase(currentLocaleTag()) + label.slice(1);
}

/** "35 €" / "€35" / "12,50 €": whole euros without decimals as in Figma, cents only when present. */
export function formatPrice(cents: number): string {
  const euros = cents / 100;
  const fraction = Number.isInteger(euros) ? 0 : 2;
  return new Intl.NumberFormat(currentLocaleTag(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(euros);
}

/** Figma "alates 35 €" when the final price depends on the dog, otherwise "12 €". */
export function priceLabel(cents: number, isFrom: boolean): string {
  return isFrom ? i18n.t('units.priceFrom', { price: formatPrice(cents) }) : formatPrice(cents);
}

/** An hour of the day as a time chip: 17 → "17.00". */
export function formatHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return formatTime(d);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "täna", "homme", "eile" or "reede, 2. okt" */
export function formatDay(iso: string, now = new Date()): string {
  const diff = Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / 86_400_000);
  if (diff === 0) return i18n.t('dates.today');
  if (diff === 1) return i18n.t('dates.tomorrow');
  if (diff === -1) return i18n.t('dates.yesterday');
  return new Date(iso).toLocaleDateString(currentLocaleTag(), { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Header date as in Figma Home: "Kolmapäev, 30. september". */
export function formatToday(now = new Date()): string {
  const text = now.toLocaleDateString(currentLocaleTag(), { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toLocaleUpperCase(currentLanguage()) + text.slice(1);
}

/** "45 min", "1 h 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return i18n.t('units.minutes', { value: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? i18n.t('units.hours', { value: hours }) : i18n.t('units.hoursMinutes', { hours, minutes: rest });
}

/** Compact for chips: "30 min", "1 h", "1,5 h" — never wraps inside a 44 pt chip. */
export function formatDurationShort(minutes: number): string {
  return minutes < 60 ? i18n.t('units.minutes', { value: minutes }) : i18n.t('units.hours', { value: number(minutes / 60) });
}

/** "1 arvustus", "32 arvustust" */
export function reviewsLabel(count: number): string {
  return i18n.t('counts.reviews', { count });
}

/** "1 koer", "3 koera" — Estonian partitive after numbers other than 1; Russian one/few/many. */
export function dogsLabel(count: number): string {
  return i18n.t('counts.dogs', { count });
}

/** "1 foto", "12 fotot" */
export function photosLabel(count: number): string {
  return i18n.t('counts.photos', { count });
}

/** "1 külastus", "18 külastust" */
export function visitsLabel(count: number): string {
  return i18n.t('counts.visits', { count });
}

/** "isane" / "emane" */
export function dogSexLabel(sex: DogSex): string {
  return i18n.t(sex === 'male' ? 'dogs.sex.male' : 'dogs.sex.female');
}

/** A calendar date ("2026-03-01") as a local Date — never `new Date(iso)`, which is UTC and can shift a day. */
function localDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** "1. märts 2026" / "1 March 2026" / "1 марта 2026 г." */
export function formatDate(isoDate: string): string {
  return localDate(isoDate).toLocaleDateString(currentLocaleTag(), { day: 'numeric', month: 'long', year: 'numeric' });
}

/** A moment as "AAAA-KK-PP" in the device's time zone (default: today, e.g. a new health record). */
export function localIsoDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Days from today to a due date: 0 = today, negative = overdue. */
function daysUntil(isoDate: string, now: Date): number {
  return Math.round((localDate(isoDate).getTime() - startOfDay(now)) / 86_400_000);
}

/** Whether a due date has passed — drives the danger colour on health rows. */
export function isOverdue(isoDate: string, now = new Date()): boolean {
  return daysUntil(isoDate, now) < 0;
}

/** "täna", "homme", "5 päeva pärast", "1 päev hilinenud", "12 päeva hilinenud" for a due date. */
export function dueLabel(isoDate: string, now = new Date()): string {
  const days = daysUntil(isoDate, now);
  if (days === 0) return i18n.t('dates.today');
  if (days === 1) return i18n.t('dates.tomorrow');
  if (days > 1) return i18n.t('dates.inDays', { count: days });
  return i18n.t('dates.overdue', { count: -days });
}

/** "alla kuu", "7 kuud", "1 aasta", "4 aastat" — a dog's age from its birth date. */
export function ageLabel(birthDate: string, now = new Date()): string {
  const [y, m] = birthDate.split('-').map(Number);
  const months = Math.max((now.getFullYear() - y!) * 12 + (now.getMonth() + 1 - m!), 0);
  if (months >= 12) return i18n.t('dates.ageYears', { count: Math.floor(months / 12) });
  if (months === 0) return i18n.t('dates.ageNewborn');
  return i18n.t('dates.ageMonths', { count: months });
}

/** Figma "Mari ja Luna": the owner's first name with their dogs; just the name without dogs. */
export function personTitle(firstName: string, dogNames: string[]): string {
  if (dogNames.length === 0) return firstName;
  return i18n.t('community.nameWithDogs', { name: firstName, dogs: dogNames.join(', ') });
}

/**
 * The date in "Sõbrad alates …" on a friend's profile. A month name after "since" needs a case
 * ending Intl cannot produce ("alates oktoobrist", "с октября"), so: Russian/English use the long
 * date, where Intl itself declines the month ("2 октября 2026 г."); Estonian uses the numeric date
 * ("02.10.2026"), the usual written form after "alates".
 */
export function formatFriendsSince(iso: string): string {
  const date = new Date(iso);
  return currentLanguage() === 'et'
    ? date.toLocaleDateString(currentLocaleTag(), { day: '2-digit', month: '2-digit', year: 'numeric' })
    : date.toLocaleDateString(currentLocaleTag(), { day: 'numeric', month: 'long', year: 'numeric' });
}

/** A chat timestamp: the time today, otherwise the day and the time. */
export function formatMessageTime(iso: string, now = new Date()): string {
  const sameDay = startOfDay(new Date(iso)) === startOfDay(now);
  return sameDay ? formatTime(iso) : `${formatDay(iso, now)} ${formatTime(iso)}`;
}
