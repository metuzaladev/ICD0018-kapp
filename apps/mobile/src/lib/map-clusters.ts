import Supercluster, { type ClusterProperties, type PointFeature } from 'supercluster';

import type { LngLatBox } from './explore';

/**
 * Pin clustering for the Kaart tab (M11). With the 71 real parks plus community places the Tallinn
 * view was an unreadable pile of pins on top of the map labels; nearby pins now merge into one
 * count bubble that zooms in when tapped.
 *
 * Why supercluster: pure JavaScript (no native module, no new development build), the de-facto
 * standard index behind MapLibre GL's own GeoJSON clustering, and it answers "clusters in this box
 * at this zoom" in well under a millisecond for a few hundred points. MapLibre's native clustering
 * (GeoJSONSource cluster) would need the pins as style layers, but ours are React views (DogPin
 * faces, VoiceOver labels per pin), so the index runs in JS and the result is drawn as Markers.
 *
 * Pure (no React, no react-native): unit-tested in test/map-clusters.test.ts.
 */

/** Anything with a stable key and a position can be clustered (parks, places). */
export type ClusterInput = { key: string; lat: number; lng: number };

export type ClusterItem<T extends ClusterInput> =
  | { type: 'pin'; key: string; lat: number; lng: number; item: T }
  | { type: 'cluster'; key: string; id: number; lat: number; lng: number; count: number };

type PointProps = { key: string };

/** Pixel radius pins merge within (a 40 pt pin + its neighbour's half), and the last clustering zoom. */
const CLUSTER_RADIUS = 56;
export const CLUSTER_MAX_ZOOM = 15;
/** The map opens here: a city view (≈ Tallinn's centre on a phone), not a fit of every park. */
export const CITY_ZOOM = 12.5;
/** Tapping a cluster never zooms further than this (street level, pins are separate long before). */
export const MAX_EXPANSION_ZOOM = 17;

/** Whole world: used before the map has reported its first region. */
export const WORLD_BOX: LngLatBox = [-180, -85, 180, 85];

/** One GeoJSON point per input; the key travels in the properties so clusters can be resolved back. */
export function toFeatures(items: readonly ClusterInput[]): PointFeature<PointProps>[] {
  return items
    .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
    .map((i) => ({ type: 'Feature', properties: { key: i.key }, geometry: { type: 'Point', coordinates: [i.lng, i.lat] } }));
}

export type ClusterIndex = Pick<Supercluster<PointProps>, 'getClusters' | 'getClusterExpansionZoom'>;

export function createClusterIndex(items: readonly ClusterInput[]): ClusterIndex {
  return new Supercluster<PointProps>({ radius: CLUSTER_RADIUS, maxZoom: CLUSTER_MAX_ZOOM }).load(toFeatures(items));
}

/**
 * Clusters and single pins inside `bounds` at `zoom`. Supercluster indexes integer zooms, so the
 * fractional camera zoom is floored (pins split when the next whole level is reached, not before).
 */
export function clustersIn<T extends ClusterInput>(index: ClusterIndex, items: readonly T[], bounds: LngLatBox, zoom: number): ClusterItem<T>[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const z = Math.max(0, Math.floor(Number.isFinite(zoom) ? zoom : 0));
  const result: ClusterItem<T>[] = [];
  for (const feature of index.getClusters([...bounds] as [number, number, number, number], z)) {
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const props = feature.properties as Partial<ClusterProperties> & Partial<PointProps>;
    if (props.cluster && typeof props.cluster_id === 'number') {
      result.push({ type: 'cluster', key: `cluster-${props.cluster_id}`, id: props.cluster_id, lat, lng, count: props.point_count ?? 0 });
    } else if (props.key) {
      const item = byKey.get(props.key);
      if (item) result.push({ type: 'pin', key: item.key, lat, lng, item });
    }
  }
  return result;
}

/**
 * Where the camera goes when a cluster is tapped: centred on it, at the zoom where it splits
 * (supercluster's expansion zoom), at least one level deeper than now and never past street level.
 */
export function expansionTarget(index: ClusterIndex, cluster: { id: number; lat: number; lng: number }, currentZoom: number) {
  let zoom: number;
  try {
    zoom = index.getClusterExpansionZoom(cluster.id);
  } catch {
    // A stale id (the index was rebuilt meanwhile): just zoom in two levels.
    zoom = currentZoom + 2;
  }
  return { center: [cluster.lng, cluster.lat] as [number, number], zoom: Math.min(MAX_EXPANSION_ZOOM, Math.max(zoom, Math.floor(currentZoom) + 1)) };
}

/** Bubble diameter grows a little with the count; never under the 44 pt touch target. */
export function clusterSize(count: number): number {
  if (count < 10) return 44;
  if (count < 50) return 50;
  return 56;
}

/**
 * Trailing debounce with cancel. MapLibre reports a settled region once per gesture, but a camera
 * animation (fit, locate, cluster tap) can report several in a row; recomputing clusters once
 * after the last one keeps the markers from flickering.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
