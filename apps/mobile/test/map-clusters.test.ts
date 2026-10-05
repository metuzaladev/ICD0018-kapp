import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLUSTER_MAX_ZOOM,
  clusterSize,
  clustersIn,
  createClusterIndex,
  debounce,
  expansionTarget,
  MAX_EXPANSION_ZOOM,
  toFeatures,
  WORLD_BOX,
  type ClusterIndex,
} from '@/lib/map-clusters';

const pin = (key: string, lat: number, lng: number) => ({ key, lat, lng });

// Old Town Tallinn: three parks within a few hundred metres, one in Pirita (~6 km away).
const oldTown = [pin('a', 59.437, 24.745), pin('b', 59.4375, 24.746), pin('c', 59.438, 24.744)];
const pirita = pin('p', 59.468, 24.835);

describe('toFeatures', () => {
  it('maps a point to a GeoJSON feature with [lng, lat] and its key', () => {
    expect(toFeatures([pin('a', 59.4, 24.7)])).toEqual([
      { type: 'Feature', properties: { key: 'a' }, geometry: { type: 'Point', coordinates: [24.7, 59.4] } },
    ]);
  });

  it('drops points without a finite position', () => {
    expect(toFeatures([pin('a', NaN, 24.7), pin('b', 59.4, Infinity), pin('c', 59.4, 24.7)]).map((f) => f.properties.key)).toEqual(['c']);
  });
});

describe('clustersIn (real supercluster index)', () => {
  const items = [...oldTown, pirita];
  const index = createClusterIndex(items);

  it('merges close pins into one cluster at city zoom and keeps the far one single', () => {
    const result = clustersIn(index, items, WORLD_BOX, 12.5);
    const clusters = result.filter((r) => r.type === 'cluster');
    const pins = result.filter((r) => r.type === 'pin');
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ type: 'cluster', count: 3 });
    expect(pins.map((p) => p.key)).toEqual(['p']);
  });

  it('gives every pin back as itself past the last clustering zoom', () => {
    const result = clustersIn(index, items, WORLD_BOX, CLUSTER_MAX_ZOOM + 2);
    expect(result.every((r) => r.type === 'pin')).toBe(true);
    expect(result.map((r) => r.key).sort()).toEqual(['a', 'b', 'c', 'p']);
    const a = result.find((r) => r.key === 'a');
    expect(a?.type === 'pin' && a.item).toBe(items[0]);
  });

  it('only returns what is inside the box', () => {
    // A box around Pirita only.
    const result = clustersIn(index, items, [24.8, 59.45, 24.9, 59.5], 14);
    expect(result.map((r) => r.key)).toEqual(['p']);
  });

  it('floors the fractional camera zoom and tolerates NaN', () => {
    expect(clustersIn(index, items, WORLD_BOX, 12.99)).toEqual(clustersIn(index, items, WORLD_BOX, 12));
    expect(clustersIn(index, items, WORLD_BOX, NaN).length).toBeGreaterThan(0);
  });

  it('an empty index gives nothing', () => {
    expect(clustersIn(createClusterIndex([]), [], WORLD_BOX, 12)).toEqual([]);
  });

  it('the expansion zoom of a real cluster splits it', () => {
    const cluster = clustersIn(index, items, WORLD_BOX, 12).find((r) => r.type === 'cluster');
    if (cluster?.type !== 'cluster') throw new Error('expected a cluster');
    const target = expansionTarget(index, cluster, 12);
    const after = clustersIn(index, items, WORLD_BOX, target.zoom);
    expect(after.filter((r) => r.type === 'cluster' && r.count === 3)).toHaveLength(0);
  });
});

describe('expansionTarget (mocked index)', () => {
  const mockIndex = (zoom: number | Error): ClusterIndex => ({
    getClusters: vi.fn(),
    getClusterExpansionZoom: vi.fn(() => {
      if (zoom instanceof Error) throw zoom;
      return zoom;
    }),
  });
  const cluster = { id: 7, lat: 59.43, lng: 24.75 };

  it('centres on the cluster at its expansion zoom', () => {
    const index = mockIndex(14);
    expect(expansionTarget(index, cluster, 12.5)).toEqual({ center: [24.75, 59.43], zoom: 14 });
    expect(index.getClusterExpansionZoom).toHaveBeenCalledWith(7);
  });

  it('always zooms in at least one whole level', () => {
    expect(expansionTarget(mockIndex(12), cluster, 12.5).zoom).toBe(13);
  });

  it('never zooms past street level', () => {
    expect(expansionTarget(mockIndex(22), cluster, 16).zoom).toBe(MAX_EXPANSION_ZOOM);
  });

  it('a stale cluster id zooms in two levels instead of throwing', () => {
    expect(expansionTarget(mockIndex(new Error('No cluster with the specified id.')), cluster, 12).zoom).toBe(14);
  });
});

describe('clusterSize', () => {
  it('is at least the 44 pt touch target and grows with the count', () => {
    expect(clusterSize(2)).toBe(44);
    expect(clusterSize(10)).toBe(50);
    expect(clusterSize(71)).toBe(56);
  });
});

describe('debounce', () => {
  afterEach(() => vi.useRealTimers());

  it('calls once with the last arguments after the quiet period', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 150);
    d(1);
    d(2);
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    d(3);
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('cancel drops a pending call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('x');
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});
