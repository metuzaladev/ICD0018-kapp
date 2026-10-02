import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';

import { DogPin } from '@/components/map-pins';
import { Radius } from '@/constants/theme';
import { TALLINN_CENTER } from '@/hooks/use-device-location';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { dogsLabel } from '@/lib/format';
import { MAP_STYLE } from '@/lib/map-style';

/**
 * Illustrative dog groups around Tallinn's centre (Figma "3 koera", "6 koera", "2 koera").
 * Marketing illustration on the intro and permission screens, before the user has an account or a
 * location — not presented as live data, and hidden from VoiceOver.
 */
const SAMPLE_GROUPS = [
  { id: 'a', lng: 24.738, lat: 59.441, dogs: 3 },
  { id: 'b', lng: 24.768, lat: 59.442, dogs: 6 },
  { id: 'c', lng: 24.752, lat: 59.433, dogs: 2 },
];

/**
 * Figma Onboarding / Discover and Permissions / Location map preview: a real (OpenFreeMap) map of
 * central Tallinn with dog pins, non-interactive. Replaces the earlier park photo (docs/11) now that
 * the map is a component. Faces are paw placeholders — no stranger's dog photo is shown.
 */
export function MapPreview({ height = 220 }: { height?: number }) {
  const c = useTheme();
  const scheme = useColorScheme();
  return (
    <View
      style={[styles.frame, { height, borderColor: c.border }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
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
        attributionPosition={{ bottom: 8, right: 8 }}>
        <Camera initialViewState={{ center: [TALLINN_CENTER.lng, TALLINN_CENTER.lat], zoom: 13.2 }} />
        {SAMPLE_GROUPS.map((g) => (
          <Marker key={g.id} id={g.id} lngLat={[g.lng, g.lat]}>
            <DogPin faces={[null, null, null].slice(0, Math.min(g.dogs, 3))} countLabel={dogsLabel(g.dogs)} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: Radius[24], overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
