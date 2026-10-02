import type { MapPlace, Park } from '@kapp/shared';
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
import { placeKindOf, type LngLatBox } from '@/lib/explore';
import { parkPinModel } from '@/lib/map-categories';
import { MAP_STYLE } from '@/lib/map-style';

type Point = { lat: number; lng: number };

type ParkMapProps = {
  parks: Park[];
  /**
   * Places from GET /map/places in the visible box (M9b): community posts (cafés, beaches, shops),
   * service providers and parks that are not already drawn from `parks`.
   */
  places?: MapPlace[];
  /** The selected place (provider sheet open): its pin gets the dark ring. */
  selectedPlaceId?: string | null;
  center: Point;
  showUserLocation: boolean;
  onParkPress: (park: Park) => void;
  onPlacePress?: (place: MapPlace) => void;
  /** Visible box after the user (or the camera) moved the map: drives the places query. */
  onRegionChange?: (bounds: LngLatBox) => void;
  /** One-shot "centre here" (post "Kaardil"); replaces the initial fit when present. */
  focus?: { lat: number; lng: number; nonce: number } | null;
  onFocusApplied?: (nonce: number) => void;
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
export function ParkMap({
  parks,
  places = [],
  selectedPlaceId = null,
  center,
  showUserLocation,
  onParkPress,
  onPlacePress,
  onRegionChange,
  focus = null,
  onFocusApplied,
  overlay,
  locateSignal = 0,
}: ParkMapProps) {
  const c = useTheme();
  const { t } = useTranslation();
  // Camera moves jump instead of gliding when Reduce Motion is on.
  const cameraDuration = useReduceMotion() ? 0 : 600;
  const scheme = useColorScheme();
  const camera = useRef<CameraRef>(null);
  // Camera commands sent before the style has loaded are dropped by the native map.
  const [loaded, setLoaded] = useState(false);

  const bounds = useMemo(() => boundsOf(center, parks), [center, parks]);
  const padding = { top: overlay.top + EDGE, bottom: overlay.bottom + EDGE, left: EDGE, right: EDGE };
  // Re-fit only when the nearby parks change (location, filters), never when the box-driven places
  // load: those follow the camera, and fitting to them would move the camera → new box → loop.
  const fitKey = `${center.lat},${center.lng}|${parks.map((p) => p.id).join(',')}`;
  // After a "Kaardil" focus the user wants that place, not the automatic fit.
  const focused = useRef(false);

  useEffect(() => {
    if (!loaded || !focus) return;
    focused.current = true;
    camera.current?.easeTo({ center: [focus.lng, focus.lat], zoom: 15, duration: cameraDuration });
    onFocusApplied?.(focus.nonce);
    // Only a new focus request (nonce) moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, focus?.nonce]);

  useEffect(() => {
    if (!loaded || focused.current || focus) return;
    if (parks.length === 0) {
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
      onDidFinishLoadingMap={() => setLoaded(true)}
      // Fires once the camera settles (not while panning), so one request per gesture.
      onRegionDidChange={(event) => onRegionChange?.(event.nativeEvent.bounds)}>
      <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom: 12 }} />
      {showUserLocation ? <NativeUserLocation /> : null}
      {places.map((place) => (
        <Marker key={`${place.kind}-${place.id}`} id={`${place.kind}-${place.id}`} lngLat={[place.lng, place.lat]} onPress={() => onPlacePress?.(place)}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={t('map.placeMarker', { name: place.name, kind: t(`map.placeKinds.${placeKindOf(place)}`) })}
            accessibilityHint={place.kind === 'provider' ? t('map.providerHint') : undefined}>
            <PlacePin kind={placeKindOf(place)} selected={place.id === selectedPlaceId} />
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
