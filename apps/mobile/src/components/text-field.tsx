import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  label: string;
  /** Validation message shown under the field and announced by VoiceOver. */
  error?: string;
};

/** Figma component "Input": label above the value, 1 pt border, error text below. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ label, error, style, ...rest }, ref) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? c.danger : focused ? c.brand : c.border;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.box, { backgroundColor: c.surface, borderColor }]}>
        <ThemedText type="caption" themeColor="muted">
          {label}
        </ThemedText>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={c.muted}
          selectionColor={c.brand}
          style={[styles.input, { color: c.text }, style]}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? (
        <ThemedText type="caption" themeColor="danger" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one },
  box: { borderWidth: 1, borderRadius: Radius[16], paddingHorizontal: Spacing.three, paddingVertical: 12, gap: 2 },
  input: { ...Type.body, paddingVertical: 4, minHeight: 28 },
});
