import type { PlaceCategory } from '@kapp/shared';
import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlacePin } from '@/components/map-pins';
import { Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { MAP_STYLE } from '@/lib/map-style';
import type { PlaceKind } from '@/lib/map-categories';

const PIN_KIND: Record<PlaceCategory, PlaceKind> = { cafe: 'cafe', park: 'park', beach: 'beach', shop: 'shop', other: 'shop' };

type Point = { lat: number; lng: number };

/**
 * "Soovita kohta" location: a small map with a fixed pin in the middle — the user drags the map
 * until the pin sits on the place (the common "move the map, not the pin" pattern; dragging a 40 pt
 * marker inside a scroll view is fiddly). The chosen point is the map centre after each move.
 *
 * The map itself is not reachable with VoiceOver (a map is not a list of choices); the screen
 * offers "Kasuta minu asukohta" and the address field as the accessible way, and reads the point
 * back in words.
 */
export function LocationPicker({
  value,
  recenter,
  category,
  onChange,
}: {
  value: Point;
  /** Changed by "Kasuta minu asukohta": the camera jumps to `value`. */
  recenter: number;
  category: PlaceCategory | null;
  /** `byUser` is false for camera moves the app made (load, recenter). */
  onChange: (point: Point, byUser: boolean) => void;
}) {
  const c = useTheme();
  const scheme = useColorScheme();
  const reduceMotion = useReduceMotion();
  const camera = useRef<CameraRef>(null);
  const [initial] = useState(value);

  useEffect(() => {
    if (recenter === 0) return;
    camera.current?.easeTo({ center: [value.lng, value.lat], zoom: 16, duration: reduceMotion ? 0 : 400 });
    // Only the button (recenter counter) moves the camera; drags report through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter]);

  return (
    <View style={[styles.frame, { borderColor: c.border }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE[scheme]}
        logo={false}
        compass={false}
        touchRotate={false}
        touchPitch={false}
        attributionPosition={{ bottom: 8, right: 8 }}
        onRegionDidChange={(event) => {
          const [west, south, east, north] = event.nativeEvent.bounds;
          onChange({ lat: (south + north) / 2, lng: (west + east) / 2 }, event.nativeEvent.userInteraction);
        }}>
        <Camera ref={camera} initialViewState={{ center: [initial.lng, initial.lat], zoom: 16 }} />
      </Map>
      {/* The pin's tip marks the centre: lift it by its own height. */}
      <View style={styles.pin} pointerEvents="none">
        <PlacePin kind={category ? PIN_KIND[category] : 'park'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 200, borderRadius: Radius[24], overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  pin: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 54 },
});
