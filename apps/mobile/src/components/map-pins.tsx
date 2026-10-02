import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PhotoTile } from '@/components/photo-tile';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PLACE_ICON, type PlaceKind } from '@/lib/map-categories';

/**
 * Figma "Map Pin / Place" and "Map Pin / Dog" (Explore & Rewards, 56:177 / 56:189).
 *
 * The pins are drawing only: the MapLibre Marker around them handles the tap and the caller puts
 * role + label on the wrapper (ParkMap). Fixed sizes are fine here — there is no text except the
 * short "N koera" pill, which sizes to its label.
 */

/** Small downward triangle under a pin (Figma "Tail"), drawn with borders — no SVG needed. */
function Tail({ color, width }: { color: string; width: number }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: width / 2,
        borderRightWidth: width / 2,
        borderTopWidth: Math.round(width * 0.6),
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
        marginTop: -1,
      }}
    />
  );
}

const PLACE_COLOR = {
  park: 'mapPark',
  cafe: 'mapCafe',
  beach: 'mapBeach',
  service: 'mapService',
  vet: 'mapVet',
} as const;

/** 40 pt circle in the category colour, 3 pt ring that separates it from the tiles, icon, tail. */
export function PlacePin({ kind, selected = false }: { kind: PlaceKind; selected?: boolean }) {
  const c = useTheme();
  const fill = c[PLACE_COLOR[kind]];
  return (
    <View style={styles.pin}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: fill, borderColor: selected ? c.text : c.mapPinRing },
        ]}>
        <Icon name={PLACE_ICON[kind]} size={20} color={c.mapPinInk} />
      </View>
      <Tail color={fill} width={12} />
    </View>
  );
}

type DogPinProps = {
  /** Up to three faces (signed thumbnail URL, bundled sample image, or null → paw placeholder). */
  faces: (string | number | null)[];
  /** The "N koera" pill text; omitted for a single dog (Figma Type=Single). */
  countLabel?: string;
  selected?: boolean;
};

/**
 * Dogs in a park: rounded-square photos with a brand border. Single = one 56 pt face with a tail;
 * group = up to three overlapping 48 pt faces and a brand "N koera" pill below (Figma Type=Group).
 */
export function DogPin({ faces, countLabel, selected = false }: DogPinProps) {
  const c = useTheme();
  const border = { width: 3, color: selected ? c.text : c.brand };
  if (faces.length <= 1 && !countLabel) {
    return (
      <View style={[styles.pin, styles.shadow]}>
        <PhotoTile uri={faces[0]} size={56} radius={18} border={border} />
        <Tail color={border.color} width={14} />
      </View>
    );
  }
  return (
    <View style={[styles.pin, styles.shadow, { gap: Spacing.one }]}>
      <View style={styles.stack}>
        {faces.map((uri, i) => (
          <PhotoTile key={i} uri={uri} size={48} radius={15} border={border} style={i > 0 && styles.overlap} />
        ))}
      </View>
      {countLabel ? (
        <View style={[styles.count, { backgroundColor: border.color }]}>
          <ThemedText type="caption" style={{ color: selected ? c.background : c.onBrand }} maxFontSizeMultiplier={1.2}>
            {countLabel}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { alignItems: 'center' },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    // Figma shadow 0 4 12 rgba(0,0,0,0.16).
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  // Figma drop shadow 0 6 8 rgba(0,0,0,0.16).
  shadow: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 6 } },
  stack: { flexDirection: 'row' },
  overlap: { marginLeft: -14 },
  count: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: Radius.full },
});
