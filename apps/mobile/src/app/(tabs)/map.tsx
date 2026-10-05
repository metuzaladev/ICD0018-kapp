import { ios, type MapPlace, type Park } from '@kapp/shared';
import { PermissionStatus } from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { CommunityEntry, ExploreFeed } from '@/components/explore-feed';
import { Fade } from '@/components/fade';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { ChipRow, IconChip } from '@/components/icon-chip';
import { LocationPrompt } from '@/components/location-prompt';
import { NearestParkCard } from '@/components/nearest-park-card';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkMap } from '@/components/park-map';
import { PointsBadge } from '@/components/points-badge';
import { ProviderSheet } from '@/components/provider-sheet';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useMapPlaces } from '@/hooks/use-explore';
import { useNearbyParks } from '@/hooks/use-parks';
import { useTheme } from '@/hooks/use-theme';
import { currentLocaleTag } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { bboxAround, bboxFromRegion, mapTagsFor, placeRoute, type Bbox } from '@/lib/explore';
import { AVAILABLE_CATEGORIES, CATEGORY_ICON, categoryShows, parkKindOf, type MapCategory } from '@/lib/map-categories';
import { clearMapFocus, useExploreState } from '@/state/explore-view';
import { activeFilterCount, DEFAULT_FILTERS, setParkFilters, useParkFilters } from '@/state/park-filters';

/** Floating UI heights used to keep pins clear of it (search 52 + chips 44 + gaps). */
const TOP_UI = 52 + Spacing.two + 44 + Spacing.two;
const BOTTOM_CARD = 74;

/**
 * The Kaart tab has two halves (M9b): the full-screen map and the Avasta feed. Which one shows is
 * a tab-local choice in state/explore-view.ts — the feed's Segmented Control "Kaart / Avasta" and
 * the map's "Kogukonna soovitused" button switch it without pushing a screen, so the back gesture
 * never flips between them and other screens can steer the tab ("Kaardil" on a post, Pood's mini
 * map). See docs/16 → "Kaart ja Avasta".
 */
export default function KaartTab() {
  const { view } = useExploreState();
  return view === 'feed' ? <ExploreFeed /> : <MapScreen />;
}

/**
 * Figma 02 / Explore / Map (10:148) and 09 / Explore & Rewards map (81:7510): an edge-to-edge map
 * under the status bar, floating search + Käpad badge + filters, category chips, locate and list
 * buttons and the "Lähim park" card above the floating tab bar. Parks with dogs come from the
 * nearby list (live dog counts); everything else from GET /map/places for the visible box, with
 * `kind` deciding where a pin leads. A service pin opens the provider sheet (81:7764).
 */
function MapScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const location = useDeviceLocation();
  const filters = useParkFilters();
  const { focus } = useExploreState();
  const nearby = useNearbyParks(location.origin, filters);
  const { data: parks = [], error, isPending } = nearby;
  const [category, setCategory] = useState<MapCategory>(focus?.category ?? 'all');
  const [region, setRegion] = useState<Bbox | null>(null);
  const bbox = region ?? (focus?.lat !== undefined && focus.lng !== undefined ? bboxAround({ lat: focus.lat, lng: focus.lng }) : bboxAround(location.origin));
  const placesQuery = useMapPlaces(bbox, mapTagsFor(category));
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [query, setQuery] = useState('');
  const [locateSignal, setLocateSignal] = useState(0);
  // Per session: "Mitte praegu" hides the permission screen until the next launch.
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [promptRequested, setPromptRequested] = useState(false);
  const featureCount = activeFilterCount(filters);

  // A focus request selects its chip once (adjusting state while rendering, React's pattern for
  // "state follows a prop"); its point is applied by the map once the style has loaded.
  const [handledFocus, setHandledFocus] = useState<number | null>(focus?.nonce ?? null);
  if (focus && focus.nonce !== handledFocus) {
    setHandledFocus(focus.nonce);
    if (focus.category) setCategory(focus.category);
  }
  // A chip-only focus (Pood → "Lähedal kaardil") has nothing left for the map: clear it.
  useEffect(() => {
    if (focus && focus.lat === undefined) clearMapFocus(focus.nonce);
  }, [focus]);

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(currentLocaleTag());
    return (name: string) => q === '' || name.toLocaleLowerCase(currentLocaleTag()).includes(q);
  }, [query]);
  const visibleParks = useMemo(() => parks.filter((p) => categoryShows(category, parkKindOf(p)) && matches(p.name)), [category, parks, matches]);
  const visiblePlaces = useMemo<MapPlace[]>(() => {
    // Parks already drawn from the nearby list (with their dog counts) are not drawn twice.
    const drawn = new Set(parks.map((p) => p.id));
    return (placesQuery.data ?? []).filter((p) => !(p.kind === 'park' && drawn.has(p.id)) && matches(p.name));
  }, [placesQuery.data, parks, matches]);
  // The API sorts by distance, so the first visible park is the nearest one (or the best search match).
  // "Lähim park" means a dog park: a swimming spot is only offered when nothing else is visible.
  const nearest: Park | undefined = visibleParks.find((p) => parkKindOf(p) === 'park') ?? visibleParks[0];

  // Full-screen explanation before the one-time system dialog; only while undecided (a denied
  // permission is explained again only when the user taps "locate").
  const showPrompt =
    location.statusKnown &&
    location.status !== PermissionStatus.GRANTED &&
    ((location.status === PermissionStatus.UNDETERMINED && !promptDismissed) || promptRequested);
  if (showPrompt) {
    return (
      <LocationPrompt
        status={location.status}
        canAskAgain={location.canAskAgain}
        onRequest={async () => {
          await location.requestPermission();
          setPromptRequested(false);
        }}
        onDismiss={() => {
          setPromptDismissed(true);
          setPromptRequested(false);
        }}
      />
    );
  }

  const tabBarSpace = insets.bottom + ios.tabBarHeight + Spacing.three;
  const bottomBlock = BOTTOM_CARD + Spacing.three + 52;
  const mapError = error ?? placesQuery.error;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ParkMap
        parks={visibleParks}
        places={visiblePlaces}
        selectedPlaceId={selected?.id ?? null}
        center={location.origin}
        showUserLocation={!location.usingFallback}
        onParkPress={(park) => router.push({ pathname: '/parks/[parkId]', params: { parkId: park.id } })}
        onPlacePress={(place) => (place.kind === 'provider' ? setSelected(place) : router.push(placeRoute(place)))}
        onRegionChange={(bounds) => setRegion(bboxFromRegion(bounds))}
        focus={focus?.lat !== undefined && focus.lng !== undefined ? { lat: focus.lat, lng: focus.lng, nonce: focus.nonce } : null}
        onFocusApplied={clearMapFocus}
        overlay={{ top: insets.top + TOP_UI, bottom: tabBarSpace + bottomBlock }}
        locateSignal={locateSignal}
      />
      {/* Status bar legibility over the tiles (Figma top fade). */}
      <Fade direction="up" style={{ top: 0, height: insets.top + 40 }} />

      <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Icon name="search" size={20} color={c.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('map.searchPlaceholder')}
              placeholderTextColor={c.muted}
              accessibilityLabel={t('map.searchLabel')}
              accessibilityHint={t('map.searchHint')}
              selectionColor={c.brand}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              maxFontSizeMultiplier={1.4}
              style={[Type.body, styles.searchInput, { color: c.text }]}
            />
            <PointsBadge onPress={() => router.push('/rewards')} />
          </View>
          <IconButton
            icon="sliders-horizontal"
            accessibilityLabel={featureCount > 0 ? t('map.filtersCount', { count: featureCount }) : t('map.filters')}
            accessibilityHint={t('map.filtersHint')}
            badge={featureCount > 0}
            onPress={() => router.push('/park-filters')}
          />
        </View>
        <ChipRow radiogroup bleed={Spacing.three}>
          {AVAILABLE_CATEGORIES.map((key) => (
            <IconChip
              key={key}
              role="radio"
              icon={CATEGORY_ICON[key]}
              label={t(`map.categories.${key}`)}
              selected={category === key}
              onPress={() => {
                setCategory(key);
                setSelected(null);
              }}
            />
          ))}
        </ChipRow>
        <OfflineBanner />
        {/* Cached pins stay on the map when a refresh fails (offline); only report the error. */}
        {mapError && (parks.length > 0 || visiblePlaces.length > 0) ? <FormError message={errorMessage(mapError)} /> : null}
      </View>

      {selected ? (
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <ProviderSheet providerId={selected.id} onClose={() => setSelected(null)} />
          {/* The sheet covers the tab bar area like Figma; keep it above the floating tab bar. */}
          <View style={{ height: tabBarSpace - Spacing.three, backgroundColor: c.background }} />
        </View>
      ) : (
        <View style={[styles.bottom, { bottom: tabBarSpace }]} pointerEvents="box-none">
          <View style={styles.controls} pointerEvents="box-none">
            <CommunityEntry />
            <View style={styles.spacer} pointerEvents="none" />
            <IconButton icon="map" accessibilityLabel={t('map.openList')} accessibilityHint={t('map.openListHint')} onPress={() => router.push('/parks')} />
            <IconButton
              icon="navigation"
              accessibilityLabel={t('map.locate')}
              onPress={() => (location.status === PermissionStatus.GRANTED ? setLocateSignal((n) => n + 1) : setPromptRequested(true))}
            />
          </View>
          {error && parks.length === 0 && categoryShows(category, 'park') ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <ErrorState message={errorMessage(error)} onRetry={() => void nearby.refetch()} retrying={nearby.isFetching} />
            </View>
          ) : null}
          {!isPending && !error && category === 'parks' && visibleParks.length === 0 ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <EmptyState
                title={query ? t('map.noMatches') : t('map.empty')}
                actionLabel={featureCount > 0 || filters.radiusKm !== DEFAULT_FILTERS.radiusKm ? t('map.emptyAction') : undefined}
                onAction={() => setParkFilters(DEFAULT_FILTERS)}
              />
            </View>
          ) : null}
          {!placesQuery.isPending && category !== 'all' && category !== 'parks' && visiblePlaces.length === 0 ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <EmptyState title={query ? t('map.noMatches') : t('map.emptyPlaces')} />
            </View>
          ) : null}
          {nearest ? <NearestParkCard park={nearest} floating /> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.three, gap: Spacing.two },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  searchInput: { flex: 1, paddingVertical: Spacing.two },
  bottom: { position: 'absolute', left: Spacing.three, right: Spacing.three, gap: Spacing.three },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spacer: { flex: 1 },
  card: { borderRadius: Radius[16], borderWidth: 1, padding: Spacing.three },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
