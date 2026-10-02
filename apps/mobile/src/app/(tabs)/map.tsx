import { ios, type Park, type ProviderSummary } from '@kapp/shared';
import { PermissionStatus } from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
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
import { Radius, Spacing, Type } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useNearbyParks } from '@/hooks/use-parks';
import { useProviders } from '@/hooks/use-services';
import { useTheme } from '@/hooks/use-theme';
import { currentLocaleTag } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { AVAILABLE_CATEGORIES, CATEGORY_ICON, categoryShows, needsProviders, providerPlaceKind, type MapCategory } from '@/lib/map-categories';
import { activeFilterCount, DEFAULT_FILTERS, setParkFilters, useParkFilters } from '@/state/park-filters';

/** Floating UI heights used to keep pins clear of it (search 52 + chips 44 + gaps). */
const TOP_UI = 52 + Spacing.two + 44 + Spacing.two;
const BOTTOM_CARD = 74;

/**
 * Figma 02 / Explore / Map (10:148): an edge-to-edge map under the status bar with a top fade,
 * floating search + filters, category chips, a locate button and the "Lähim park" card above the
 * floating tab bar. Parks and service providers are real data; categories without data yet (cafés,
 * beaches — M9b) are not offered. The full park list is one tap away (list button → Pargid sinu ümber).
 */
export default function MapScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const location = useDeviceLocation();
  const filters = useParkFilters();
  const nearby = useNearbyParks(location.origin, filters);
  const { data: parks = [], error, isPending } = nearby;
  const [category, setCategory] = useState<MapCategory>('all');
  const providersQuery = useProviders(null, location.origin);
  const [query, setQuery] = useState('');
  const [locateSignal, setLocateSignal] = useState(0);
  // Per session: "Mitte praegu" hides the permission screen until the next launch.
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [promptRequested, setPromptRequested] = useState(false);
  const featureCount = activeFilterCount(filters);

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(currentLocaleTag());
    return (name: string) => q === '' || name.toLocaleLowerCase(currentLocaleTag()).includes(q);
  }, [query]);
  const visibleParks = useMemo(() => (categoryShows(category, 'park') ? parks.filter((p) => matches(p.name)) : []), [category, parks, matches]);
  const visibleProviders = useMemo<ProviderSummary[]>(
    () =>
      needsProviders(category)
        ? (providersQuery.data ?? []).filter((p) => categoryShows(category, providerPlaceKind(p.category)) && matches(p.name))
        : [],
    [category, providersQuery.data, matches],
  );
  // The API sorts by distance, so the first visible park is the nearest one (or the best search match).
  const nearest: Park | undefined = visibleParks[0];

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

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ParkMap
        parks={visibleParks}
        providers={visibleProviders}
        center={location.origin}
        showUserLocation={!location.usingFallback}
        onParkPress={(park) => router.push({ pathname: '/parks/[parkId]', params: { parkId: park.id } })}
        onProviderPress={(provider) => router.push({ pathname: '/services/[providerId]', params: { providerId: provider.id } })}
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
            <PointsBadge />
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
              onPress={() => setCategory(key)}
            />
          ))}
        </ChipRow>
        <OfflineBanner />
        {/* Cached parks stay on the map when a refresh fails (offline); only report the error. */}
        {error && parks.length > 0 ? <FormError message={errorMessage(error)} /> : null}
      </View>

      <View style={[styles.bottom, { bottom: tabBarSpace }]} pointerEvents="box-none">
        <View style={styles.controls} pointerEvents="box-none">
          <IconButton icon="map" accessibilityLabel={t('map.openList')} accessibilityHint={t('map.openListHint')} onPress={() => router.push('/parks')} />
          <IconButton
            icon="navigation"
            accessibilityLabel={t('map.locate')}
            onPress={() => (location.status === PermissionStatus.GRANTED ? setLocateSignal((n) => n + 1) : setPromptRequested(true))}
          />
        </View>
        {error && parks.length === 0 ? (
          <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]}>
            <ErrorState message={errorMessage(error)} onRetry={() => void nearby.refetch()} retrying={nearby.isFetching} />
          </View>
        ) : null}
        {!isPending && !error && categoryShows(category, 'park') && visibleParks.length === 0 ? (
          <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]}>
            <EmptyState
              title={query ? t('map.noMatches') : t('map.empty')}
              actionLabel={featureCount > 0 || filters.radiusKm !== DEFAULT_FILTERS.radiusKm ? t('map.emptyAction') : undefined}
              onAction={() => setParkFilters(DEFAULT_FILTERS)}
            />
          </View>
        ) : null}
        {nearest ? <NearestParkCard park={nearest} floating /> : null}
      </View>
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
  controls: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  sheet: { borderRadius: Radius[16], borderWidth: 1, padding: Spacing.three },
});
