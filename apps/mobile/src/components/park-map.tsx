import type { MapPlace, Park } from '@kapp/shared';
import { Camera, Map, Marker, NativeUserLocation, useCurrentPosition, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ClusterPin, DogPin, PlacePin, UserDot } from '@/components/map-pins';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { dogsLabel } from '@/lib/format';
import { placeKindOf, type LngLatBox } from '@/lib/explore';
import { CITY_ZOOM, clustersIn, createClusterIndex, debounce, expansionTarget, WORLD_BOX } from '@/lib/map-clusters';
import { parkKindOf, parkPinModel } from '@/lib/map-categories';
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
  /** One-shot "centre here" (post "Kaardil"); replaces the initial camera when present. */
  focus?: { lat: number; lng: number; nonce: number } | null;
  onFocusApplied?: (nonce: number) => void;
  /** Space covered by floating UI (search + chips above, nearest-park card and tab bar below). */
  overlay: { top: number; bottom: number };
  /** Incremented by the locate button: the camera returns to `center`. */
  locateSignal?: number;
};

/** What goes into the cluster index: quiet parks and places. Parks with dogs are drawn on their own. */
type Clusterable = { key: string; lat: number; lng: number } & ({ kind: 'park'; park: Park } | { kind: 'place'; place: MapPlace });

/**
 * Marker stacking (iOS: layer zPosition, explicit so it does not depend on latitude): quiet pins
 * under clusters, live dog pins above both, the user's own position always on top.
 */
const Z = { place: 10, cluster: 20, dogs: 30, me: 100 } as const;

/** Region changes within this window are coalesced before clusters are recomputed. */
const REGION_DEBOUNCE_MS = 120;

/**
 * Figma "Explore / Map" (10:148): a full-screen OpenFreeMap map. Parks with dogs now are dog pins
 * (faces + "N koera"), quiet parks are green park pins, providers are service / clinic pins.
 *
 * M11: quiet pins are clustered (lib/map-clusters.ts) so the 71 real parks no longer pile up over
 * the map labels; tapping a count bubble zooms in until it splits. Parks with dogs present are never
 * clustered: live presence is the app's main signal and there are only a handful at a time, so
 * drawing them separately on top is cheap. The map opens on the user (or Tallinn) at city zoom
 * instead of fitting every park, which with real data meant all of Estonia.
 *
 * Each pin is one VoiceOver button ("Kadrioru koertepark, 6 koera praegu"), a cluster reads
 * "5 kohta, suumi lähemale". The park list (Pargid sinu ümber) remains the accessible way to browse.
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
  // Visible box + zoom the clusters are computed for; the whole world until the first report.
  const [view, setView] = useState<{ bounds: LngLatBox; zoom: number }>({ bounds: WORLD_BOX, zoom: CITY_ZOOM });
  const setViewSoon = useMemo(() => debounce(setView, REGION_DEBOUNCE_MS), []);
  useEffect(() => () => setViewSoon.cancel(), [setViewSoon]);
  // Exact position for the "you are here" dot (the `center` prop is rounded to ~100 m for the API).
  const position = useCurrentPosition({ enabled: showUserLocation, minDisplacement: 5 });

  const padding = { top: overlay.top, bottom: overlay.bottom, left: 0, right: 0 };
  // After a "Kaardil" focus or the user's own pan/zoom, the camera is theirs: never re-centre it.
  const handedOver = useRef(false);

  const busyParks = useMemo(() => parks.filter((p) => (p.activeDogs ?? 0) > 0), [parks]);
  const clusterable = useMemo<Clusterable[]>(
    () => [
      ...parks.filter((p) => (p.activeDogs ?? 0) === 0).map((park) => ({ key: `park-${park.id}`, lat: park.lat, lng: park.lng, kind: 'park' as const, park })),
      ...places.map((place) => ({ key: `${place.kind}-${place.id}`, lat: place.lat, lng: place.lng, kind: 'place' as const, place })),
    ],
    [parks, places],
  );
  const index = useMemo(() => createClusterIndex(clusterable), [clusterable]);
  const items = useMemo(() => clustersIn(index, clusterable, view.bounds, view.zoom), [index, clusterable, view]);

  useEffect(() => {
    if (!loaded || !focus) return;
    handedOver.current = true;
    camera.current?.easeTo({ center: [focus.lng, focus.lat], zoom: 15, padding, duration: cameraDuration });
    onFocusApplied?.(focus.nonce);
    // Only a new focus request (nonce) moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, focus?.nonce]);

  // Open on the user (or Tallinn), and follow once when the real position replaces the fallback.
  useEffect(() => {
    if (!loaded || handedOver.current || focus) return;
    camera.current?.easeTo({ center: [center.lng, center.lat], zoom: CITY_ZOOM, padding, duration: cameraDuration });
    // Only the centre moves the camera; padding and duration are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, center.lat, center.lng]);

  useEffect(() => {
    if (!loaded || locateSignal === 0) return;
    camera.current?.easeTo({ center: [center.lng, center.lat], zoom: 14, padding, duration: cameraDuration });
    // Only the button press (signal change) moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateSignal]);

  const openPark = (park: Park) => onParkPress(park);

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
      // Fires once the camera settles (not while panning): one places request and one clustering per gesture.
      onRegionDidChange={(event) => {
        const { bounds, zoom, userInteraction } = event.nativeEvent;
        if (userInteraction) handedOver.current = true;
        setViewSoon({ bounds, zoom });
        onRegionChange?.(bounds);
      }}>
      <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom: CITY_ZOOM }} />
      {/* The native puck (accuracy halo, heading) is a map layer under every marker; the dot below repeats it on top. */}
      {showUserLocation ? <NativeUserLocation /> : null}
      {items.map((entry) => {
        if (entry.type === 'cluster') {
          return (
            <Marker
              key={entry.key}
              id={entry.key}
              lngLat={[entry.lng, entry.lat]}
              style={{ zIndex: Z.cluster }}
              onPress={() => {
                handedOver.current = true;
                const target = expansionTarget(index, entry, view.zoom);
                camera.current?.easeTo({ ...target, duration: cameraDuration });
              }}>
              <View accessible accessibilityRole="button" accessibilityLabel={t('map.cluster', { count: entry.count })}>
                <ClusterPin count={entry.count} />
              </View>
            </Marker>
          );
        }
        const { item } = entry;
        if (item.kind === 'park') {
          return (
            // Pins point at their place with the tail (bottom anchor), so they stand above it, not over it.
            <Marker key={entry.key} id={entry.key} anchor="bottom" lngLat={[item.lng, item.lat]} style={{ zIndex: Z.place }} onPress={() => openPark(item.park)}>
              <View
                accessible
                accessibilityRole="button"
                accessibilityLabel={t('map.markerQuiet', { name: item.park.name })}
                accessibilityHint={t('parkRow.hint')}>
                <PlacePin kind={parkKindOf(item.park)} />
              </View>
            </Marker>
          );
        }
        const { place } = item;
        return (
          <Marker key={entry.key} id={entry.key} anchor="bottom" lngLat={[place.lng, place.lat]} style={{ zIndex: Z.place }} onPress={() => onPlacePress?.(place)}>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={t('map.placeMarker', { name: place.name, kind: t(`map.placeKinds.${placeKindOf(place)}`) })}
              accessibilityHint={place.kind === 'provider' ? t('map.providerHint') : undefined}>
              <PlacePin kind={placeKindOf(place)} selected={place.id === selectedPlaceId} />
            </View>
          </Marker>
        );
      })}
      {busyParks.map((park) => {
        const pin = parkPinModel(park.activeDogs);
        if (pin.kind !== 'dogs') return null;
        return (
          <Marker key={park.id} id={park.id} anchor="bottom" lngLat={[park.lng, park.lat]} style={{ zIndex: Z.dogs }} onPress={() => openPark(park)}>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={t('map.marker', { name: park.name, dogs: dogsLabel(pin.count) })}
              accessibilityHint={t('parkRow.hint')}>
              {/* Visitors' dog photos are not part of the park API: faces are paw placeholders. */}
              <DogPin faces={Array.from({ length: pin.faces }, () => null)} countLabel={pin.showCount ? dogsLabel(pin.count) : undefined} />
            </View>
          </Marker>
        );
      })}
      {showUserLocation && position ? (
        <Marker id="me" lngLat={[position.coords.longitude, position.coords.latitude]} style={{ zIndex: Z.me }}>
          <View accessible accessibilityLabel={t('map.myLocation')} pointerEvents="none">
            <UserDot />
          </View>
        </Marker>
      ) : null}
    </Map>
  );
}
