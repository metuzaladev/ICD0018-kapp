import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SwitchRowProps = {
  label: string;
  hint?: string | null;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
};

/** A settings row with a native switch (Figma "Toggle Row"); at least 56 pt high (HIG ≥ 44 pt). */
export function SwitchRow({ label, hint, value, disabled, onValueChange }: SwitchRowProps) {
  const c = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.text}>
        <ThemedText type="label">{label}</ThemedText>
        {hint ? (
          <ThemedText type="caption" themeColor="muted">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint ?? undefined}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: c.brand }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius[16],
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
