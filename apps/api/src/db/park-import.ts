/**
 * Estonian dog parks and dog swimming spots from koertepargid.ee ("Koertepargid Eestis": the public
 * map "Koerteplatsid Eestis" and the park pages), retrieved 2026-10-05 into data/koertepargid.json.
 *
 * Only facts are kept — names, coordinates, addresses and features. The site's descriptions, photos
 * and reviews are its own work and were not copied; the description below is written from the facts.
 * There is no licence on the site, and EU database rights protect a whole collection, so a public
 * release needs the owner's permission first (info@koertepargid.ee) — see docs/05.
 *
 * Pure (no database import) so it is unit-tested.
 */

export type SourcePark = {
  name: string;
  kind: 'dog_park' | 'swimming';
  lat: number;
  lng: number;
  county: string | null;
  address: string | null;
  size: 'small' | 'medium' | 'large' | null;
  /** null = the source has no details for this place (map pin only). */
  separateSmallDogs: boolean | null;
  surface: ('grass' | 'sand' | 'wood_chips' | 'other')[];
  parking: boolean | null;
  lighting: boolean | null;
  seating: boolean | null;
  wasteBins: boolean | null;
  bagDispenser: boolean | null;
  sourceUrl: string | null;
  aliases?: string[];
};

export type ParkRow = {
  name: string;
  address: string | null;
  description: string | null;
  location: { x: number; y: number };
  fenced: boolean;
  smallDogArea: boolean;
  water: boolean;
  lighting: boolean;
  status: 'approved';
};

const SIZE: Record<NonNullable<SourcePark['size']>, string> = { small: 'Väike', medium: 'Keskmine', large: 'Suur' };
const SURFACE: Record<SourcePark['surface'][number], string> = { grass: 'muru', sand: 'liiv', wood_chips: 'hakkepuit', other: 'muu' };

/** "muru", "muru ja liiv", "muru, liiv ja hakkepuit" */
function joinEt(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ja ${items[items.length - 1]}`;
}

/**
 * A short factual Estonian description (park descriptions are Estonian content, like the names).
 * Returns null when the source has no details, so the app shows nothing rather than guesses.
 */
export function describePark(p: SourcePark): string | null {
  if (p.kind === 'swimming') return 'Koerte ujumiskoht.';
  if (p.separateSmallDogs === null && !p.size && p.surface.length === 0) return null;
  const parts: string[] = [];
  if (p.size) parts.push(`${SIZE[p.size]} park.`);
  if (p.separateSmallDogs === true) parts.push('Eraldi alad suurtele ja väikestele koertele.');
  if (p.separateSmallDogs === false) parts.push('Ühine ala kõikidele koertele.');
  if (p.surface.length) parts.push(`Pinnas: ${joinEt(p.surface.map((s) => SURFACE[s]))}.`);
  const extras = [
    p.parking && 'parkimine',
    p.seating && 'istumisala',
    p.wasteBins && (p.bagDispenser ? 'prügikastid koos korjekottidega' : 'prügikastid'),
  ].filter((x): x is string => Boolean(x));
  if (extras.length) parts.push(`${joinEt(extras).replace(/^./, (c) => c.toUpperCase())}.`);
  return parts.join(' ');
}

/**
 * Source record → parks row. Assumptions (documented in docs/05):
 * - a "koertepark" is a fenced area (that is what the term means in Estonian municipal rules; the
 *   source does not list fences separately); a swimming spot is open water, not fenced;
 * - `water` marks swimming spots — the source has no drinking-water field for parks;
 * - lighting/small-dog area are false when the source has no details (unknown is not shown as a feature).
 */
export function toParkRow(p: SourcePark): ParkRow {
  const swimming = p.kind === 'swimming';
  return {
    name: p.name,
    address: p.address,
    description: describePark(p),
    location: { x: p.lng, y: p.lat },
    fenced: !swimming,
    smallDogArea: p.separateSmallDogs === true,
    water: swimming,
    lighting: p.lighting === true,
    status: 'approved',
  };
}

/** Coordinates must be inside Estonia (same bounding box idea as place posts). */
export function isInEstonia(p: Pick<SourcePark, 'lat' | 'lng'>): boolean {
  return p.lat >= 57.5 && p.lat <= 59.9 && p.lng >= 21.5 && p.lng <= 28.3;
}
