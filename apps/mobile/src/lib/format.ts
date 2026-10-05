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
