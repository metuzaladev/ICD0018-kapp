import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';

import { DogPin } from '@/components/map-pins';
import { Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { dogsLabel } from '@/lib/format';
import { MAP_STYLE } from '@/lib/map-style';
import { SAMPLE_DOGS } from '@/lib/sample-dogs';

/**
 * Illustrative dog groups around Tallinn's centre (Figma "3 koera", "6 koera", "2 koera").
 * Marketing illustration on the intro and permission screens, before the user has an account or a
 * location — not presented as live data, and hidden from VoiceOver.
 */
const SAMPLE_GROUPS = [
  { id: 'a', lng: 24.741, lat: 59.4392, dogs: 3, faces: [SAMPLE_DOGS.charlie, SAMPLE_DOGS.pug, SAMPLE_DOGS.aussie] },
  { id: 'b', lng: 24.765, lat: 59.4398, dogs: 6, faces: [SAMPLE_DOGS.luna, SAMPLE_DOGS.rex, SAMPLE_DOGS.bella] },
  { id: 'c', lng: 24.753, lat: 59.4338, dogs: 2, faces: [SAMPLE_DOGS.rex, SAMPLE_DOGS.charlie] },
];

/** Centre of the sample groups, shifted up a little because pins hang below their point. */
const PREVIEW_CENTER: [number, number] = [24.753, 59.4372];

/**
 * Figma Onboarding / Discover and Permissions / Location map preview: a real (OpenFreeMap) map of
 * central Tallinn with dog pins, non-interactive. Replaces the earlier park photo (docs/11) now that
 * the map is a component. Faces are bundled sample photos (lib/sample-dogs.ts), not real users.
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
        {/* Zoom 12.6 keeps all three groups inside the ~342 pt card (13.2 pushed them off the edges). */}
        <Camera initialViewState={{ center: PREVIEW_CENTER, zoom: 12.6 }} />
        {SAMPLE_GROUPS.map((g) => (
          <Marker key={g.id} id={g.id} lngLat={[g.lng, g.lat]}>
            <DogPin faces={g.faces} countLabel={dogsLabel(g.dogs)} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: Radius[24], overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
