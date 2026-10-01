/**
 * Estonian display formats. One place so every screen shows "17:00", "1,2 km" and
 * "täna" the same way.
 */
const LOCALE = 'et-EE';

/** "1,2 km" */
export function formatKm(km: number | undefined): string | null {
  return km === undefined ? null : `${km.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} km`;
}

/** "17:00" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "täna", "homme", "eile" or "reede, 2. okt" */
export function formatDay(iso: string, now = new Date()): string {
  const diff = Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / 86_400_000);
  if (diff === 0) return 'täna';
  if (diff === 1) return 'homme';
  if (diff === -1) return 'eile';
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' });
}

/** "45 min", "1 h 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Compact for chips: "30 min", "1 h", "1,5 h" — never wraps inside a 44 pt chip. */
export function formatDurationShort(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} h`;
}

/** "1 hinnang", "32 hinnangut" */
export function reviewsLabel(n: number): string {
  return `${n} ${n === 1 ? 'hinnang' : 'hinnangut'}`;
}

/** "1 koer", "3 koera" — Estonian partitive after numbers other than 1. */
export function dogsLabel(n: number): string {
  return `${n} ${n === 1 ? 'koer' : 'koera'}`;
}

export const DOG_SEX_LABEL = { male: 'isane', female: 'emane' } as const;

/** A calendar date ("2026-03-01") as a local Date — never `new Date(iso)`, which is UTC and can shift a day. */
function localDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** "1. märts 2026" */
export function formatDate(isoDate: string): string {
  return localDate(isoDate).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** A moment as "AAAA-KK-PP" in the device's time zone (default: today, e.g. a new health record). */
export function localIsoDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "täna", "homme", "5 päeva pärast", "1 päev hilinenud", "12 päeva hilinenud" for a due date. */
export function dueLabel(isoDate: string, now = new Date()): string {
  const days = Math.round((localDate(isoDate).getTime() - startOfDay(now)) / 86_400_000);
  if (days === 0) return 'täna';
  if (days === 1) return 'homme';
  if (days > 1) return `${days} päeva pärast`;
  return `${-days} ${days === -1 ? 'päev' : 'päeva'} hilinenud`;
}
