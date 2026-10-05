import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Text in the Figma type scale. `type` names match the Figma text styles (Typography/*);
 * the older template names (title, subtitle, small, smallBold) are kept as aliases.
 */
export type ThemedTextProps = TextProps & {
  type?:
    | 'display'
    | 'hero'
    | 'title'
    | 'heading'
    | 'default'
    | 'label'
    | 'caption'
    | 'micro'
    | 'subtitle'
    | 'small'
    | 'smallBold'
    | 'link';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? (type === 'link' ? 'link' : 'text')];
  // Respect the user's Dynamic Type setting, but cap it so layouts built for 390 pt stay usable.
  return <Text maxFontSizeMultiplier={1.6} style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  display: Type.display,
  hero: Type.hero,
  title: Type.title,
  heading: Type.heading,
  default: Type.body,
  label: Type.label,
  caption: Type.caption,
  micro: Type.micro,
  subtitle: Type.heading,
  small: Type.caption,
  smallBold: Type.label,
  link: Type.label,
});
