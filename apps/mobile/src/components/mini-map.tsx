import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';

import { PlacePin } from '@/components/map-pins';
import { Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { PlaceKind } from '@/lib/map-categories';
import { MAP_STYLE } from '@/lib/map-style';

type Pin = { id: string; lat: number; lng: number; kind: PlaceKind };

/**
 * Figma Pood "Map / Nearby services" (85:8533): a small, non-interactive map with the partners'
 * pins. Purely a preview — the caller wraps it in a button that opens the Kaart tab (VoiceOver
 * hears that button, not the map).
 */
export function MiniMap({ pins, center, height = 160 }: { pins: Pin[]; center: { lat: number; lng: number }; height?: number }) {
  const c = useTheme();
  const scheme = useColorScheme();
  const lngs = [center.lng, ...pins.map((p) => p.lng)];
  const lats = [center.lat, ...pins.map((p) => p.lat)];
  const bounds: [number, number, number, number] = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  return (
    <View style={[styles.frame, { height, borderColor: c.border }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE[scheme]}
        logo={false}
        compass={false}
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        touchRotate={false}
        touchPitch={false}
        attributionPosition={{ bottom: 6, right: 6 }}>
        <Camera
          maxZoom={15}
          initialViewState={
            pins.length > 0
              ? { bounds, padding: { top: 56, bottom: 16, left: 32, right: 32 } }
              : { center: [center.lng, center.lat], zoom: 13 }
          }
        />
        {pins.map((p) => (
          <Marker key={p.id} id={`mini-${p.id}`} lngLat={[p.lng, p.lat]}>
            <PlacePin kind={p.kind} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: Radius[24], overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
