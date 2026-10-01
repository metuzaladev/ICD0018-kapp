import type { Park } from '@kapp/shared';
import {
  Camera,
  Map,
  Marker,
  NativeUserLocation,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * OpenFreeMap vector styles: free, no API key, OSM data with attribution built into the style.
 * Kept as constants so switching to MapTiler (paid, SLA) is a one-line change (docs/01-uuring.md).
 */
const MAP_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/** Room around the outermost markers so they are not clipped by the rounded frame. */
const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

type ParkMapProps = {
  parks: Park[];
  center: { lat: number; lng: number };
  showUserLocation: boolean;
  selectedId?: string;
  onSelect: (park: Park) => void;
};

/** Smallest box containing the user's position and every park — what the user wants to see. */
function boundsOf(center: { lat: number; lng: number }, parks: Park[]): LngLatBounds {
  const lngs = [center.lng, ...parks.map((p) => p.lng)];
  const lats = [center.lat, ...parks.map((p) => p.lat)];
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** Figma "Map / Tallinn schematic", now a real map. Markers show how many dogs are there now. */
export function ParkMap({ parks, center, showUserLocation, selectedId, onSelect }: ParkMapProps) {
  const c = useTheme();
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const camera = useRef<CameraRef>(null);
  // Camera commands sent before the style has loaded are dropped by the native map.
  const [loaded, setLoaded] = useState(false);

  const bounds = useMemo(() => boundsOf(center, parks), [center, parks]);
  // Re-fit only when the visible set changes, not on every re-render or background refetch.
  const fitKey = `${center.lat},${center.lng}|${parks.map((p) => p.id).join(',')}`;

  useEffect(() => {
    if (!loaded) return;
    if (parks.length === 0) {
      camera.current?.easeTo({ center: [center.lng, center.lat], zoom: 13, duration: 600 });
    } else {
      camera.current?.fitBounds(bounds, { padding: FIT_PADDING, duration: 600, easing: 'ease' });
    }
    // fitKey captures center + park ids; bounds is derived from the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fitKey]);

  return (
    <View style={[styles.frame, { borderColor: c.border }]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE[scheme]}
        logo={false}
        compass={false}
        tintColor={c.brand}
        onDidFinishLoadingMap={() => setLoaded(true)}>
        <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom: 12 }} />
        {showUserLocation ? <NativeUserLocation /> : null}
        {parks.map((park) => {
          const selected = park.id === selectedId;
          return (
            <Marker key={park.id} id={park.id} lngLat={[park.lng, park.lat]} onPress={() => onSelect(park)}>
              <View
                accessible
                accessibilityRole="button"
                accessibilityLabel={`${park.name}, ${park.activeDogs ?? 0} koera praegu`}
                style={[
                  styles.marker,
                  { backgroundColor: selected ? c.onBrand : c.brand, borderColor: selected ? c.brand : c.onBrand },
                ]}>
                <ThemedText type="label" style={{ color: selected ? c.brand : c.onBrand }}>
                  {park.activeDogs ?? 0}
                </ThemedText>
              </View>
            </Marker>
          );
        })}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 320, borderRadius: Radius[24], overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  // 44 pt: HIG minimum touch target.
  marker: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
