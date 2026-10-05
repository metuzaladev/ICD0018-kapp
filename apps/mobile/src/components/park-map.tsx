import type { Park, ProviderSummary } from '@kapp/shared';
import {
  Camera,
  Map,
  Marker,
  NativeUserLocation,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DogPin, PlacePin } from '@/components/map-pins';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { dogsLabel } from '@/lib/format';
import { parkPinModel, providerPlaceKind } from '@/lib/map-categories';
import { MAP_STYLE } from '@/lib/map-style';

type Point = { lat: number; lng: number };

type ParkMapProps = {
  parks: Park[];
  /** Service providers (M6) shown as Teenused / Kliinikud pins. */
  providers?: ProviderSummary[];
  center: Point;
  showUserLocation: boolean;
  onParkPress: (park: Park) => void;
  onProviderPress?: (provider: ProviderSummary) => void;
  /** Space covered by floating UI (search + chips above, nearest-park card and tab bar below). */
  overlay: { top: number; bottom: number };
  /** Incremented by the locate button: the camera returns to `center`. */
  locateSignal?: number;
};

/** Room around the outermost markers so pins (≈ 60 pt tall) are not clipped by the edges. */
const EDGE = 48;

/** Smallest box containing the user's position and every place — what the user wants to see. */
function boundsOf(center: Point, places: Point[]): LngLatBounds {
  const lngs = [center.lng, ...places.map((p) => p.lng)];
  const lats = [center.lat, ...places.map((p) => p.lat)];
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/**
 * Figma "Explore / Map" (10:148): a full-screen OpenFreeMap map. Parks with dogs now are dog pins
 * (faces + "N koera"), quiet parks are green park pins, providers are service / clinic pins.
 * Tapping a park opens its page (as before M9); a provider opens its service page.
 *
 * Each pin is one VoiceOver button ("Kadrioru koerapark, 6 koera praegu"). Markers are drawn on the
 * map as native views, so VoiceOver reaches them, but the park list (Pargid sinu ümber) remains the
 * accessible way to browse all parks.
 */
export function ParkMap({ parks, providers = [], center, showUserLocation, onParkPress, onProviderPress, overlay, locateSignal = 0 }: ParkMapProps) {
  const c = useTheme();
  const { t } = useTranslation();
  // Camera moves jump instead of gliding when Reduce Motion is on.
  const cameraDuration = useReduceMotion() ? 0 : 600;
  const scheme = useColorScheme();
  const camera = useRef<CameraRef>(null);
  // Camera commands sent before the style has loaded are dropped by the native map.
  const [loaded, setLoaded] = useState(false);

  const places = useMemo<Point[]>(() => [...parks, ...providers], [parks, providers]);
  const bounds = useMemo(() => boundsOf(center, places), [center, places]);
  const padding = { top: overlay.top + EDGE, bottom: overlay.bottom + EDGE, left: EDGE, right: EDGE };
  // Re-fit only when the visible set changes, not on every re-render or background refetch.
  const fitKey = `${center.lat},${center.lng}|${parks.map((p) => p.id).join(',')}|${providers.map((p) => p.id).join(',')}`;

  useEffect(() => {
    if (!loaded) return;
    if (places.length === 0) {
      camera.current?.easeTo({ center: [center.lng, center.lat], zoom: 13, duration: cameraDuration });
    } else {
      camera.current?.fitBounds(bounds, { padding, duration: cameraDuration, easing: 'ease' });
    }
    // fitKey captures center + ids; bounds and padding derive from the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fitKey]);

  useEffect(() => {
    if (!loaded || locateSignal === 0) return;
    camera.current?.easeTo({ center: [center.lng, center.lat], zoom: 14, duration: cameraDuration });
    // Only the button press (signal change) moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateSignal]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE[scheme]}
      logo={false}
      compass={false}
      tintColor={c.brand}
      // Keeps the © OpenStreetMap attribution visible above the nearest-park card.
      attributionPosition={{ bottom: overlay.bottom + 8, right: 8 }}
      onDidFinishLoadingMap={() => setLoaded(true)}>
      <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom: 12 }} />
      {showUserLocation ? <NativeUserLocation /> : null}
      {providers.map((provider) => (
        <Marker key={provider.id} id={`provider-${provider.id}`} lngLat={[provider.lng, provider.lat]} onPress={() => onProviderPress?.(provider)}>
          <View accessible accessibilityRole="button" accessibilityLabel={t('map.providerMarker', { name: provider.name })}>
            <PlacePin kind={providerPlaceKind(provider.category)} />
          </View>
        </Marker>
      ))}
      {parks.map((park) => {
        const pin = parkPinModel(park.activeDogs);
        return (
          <Marker key={park.id} id={park.id} lngLat={[park.lng, park.lat]} onPress={() => onParkPress(park)}>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={t('map.marker', { name: park.name, dogs: dogsLabel(park.activeDogs ?? 0) })}
              accessibilityHint={t('parkRow.hint')}>
              {pin.kind === 'place' ? (
                <PlacePin kind="park" />
              ) : (
                // Visitors' dog photos are not part of the park API: faces are paw placeholders.
                <DogPin faces={Array.from({ length: pin.faces }, () => null)} countLabel={pin.showCount ? dogsLabel(pin.count) : undefined} />
              )}
            </View>
          </Marker>
        );
      })}
    </Map>
  );
}
