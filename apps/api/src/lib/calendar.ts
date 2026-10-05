/**
 * Calendar dates ("2026-10-03") without a date library. Why plain Intl: the only zone-aware need is
 * "which day is this instant in Europe/Tallinn", which `Intl.DateTimeFormat` answers correctly
 * across daylight-saving changes; everything else is whole-day arithmetic on UTC dates, which has
 * no DST at all. Turning wall-clock times into instants is left to Postgres (`at time zone`).
 */

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date of an instant in an IANA time zone. */
export function localDate(instant: Date, timeZone: string): string {
  let format = dayFormatters.get(timeZone);
  if (!format) {
    // en-CA formats as YYYY-MM-DD.
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timeZone, format);
  }
  return format.format(instant);
}

/** "2026-10-31" + 1 → "2026-11-01". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
