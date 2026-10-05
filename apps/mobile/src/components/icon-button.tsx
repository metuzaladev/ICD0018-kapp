import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { useTheme } from '@/hooks/use-theme';

type IconButtonProps = {
  icon: IconName;
  /** Required: an icon alone says nothing to VoiceOver. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  /** Solid = primary action (brand), Glass = secondary (surface + border). */
  variant?: 'solid' | 'glass';
  /** Small dot for an active state (e.g. filters applied); the label must say the same. */
  badge?: boolean;
};

/**
 * Figma "Icon Button" (56:112): 52 × 52 pt, radius 18, soft shadow — the floating map controls
 * (filters, locate). Square by design: there is no text inside, so a fixed size is safe.
 */
export function IconButton({ icon, accessibilityLabel, accessibilityHint, onPress, variant = 'glass', badge = false }: IconButtonProps) {
  const c = useTheme();
  const solid = variant === 'solid';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={[
        styles.button,
        solid ? { backgroundColor: c.brand } : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 },
      ]}>
      <Icon name={icon} size={24} color={solid ? c.onBrand : c.text} />
      {badge ? <View style={[styles.badge, { backgroundColor: c.brand, borderColor: c.surface }]} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // Figma drop shadow 0 8 12 rgba(0,0,0,0.16).
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  badge: { position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
